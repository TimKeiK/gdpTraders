import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import {
  addDepositAddress,
  addTransaction,
  addWithdrawalRequest,
  addAuditLog,
  appendLedgerEntry,
  getDepositAddress,
  getWalletsForUser,
  getWithdrawalRequests,
  updateWithdrawalRequest,
  type Transaction,
} from '../db/index.js';
import { requireAuth, requireKycApproved, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { SUPPORTED_ASSETS } from '../data/strategies.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/wallet/addresses
 * Returns the user's deposit addresses per asset.
 */
router.get('/addresses', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const addresses = [];
  for (const asset of SUPPORTED_ASSETS) {
    const existing = await getDepositAddress(userId, asset);
    if (existing) {
      addresses.push(existing);
    } else {
      const addr = {
        address: `deposit_${asset}_${nanoid(32)}`,
        userId,
        asset,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      await addDepositAddress(addr);
      addresses.push(addr);
    }
  }
  res.json(addresses);
});

/**
 * GET /api/wallet/balances
 * Returns the user's wallets across custody tiers (hot/warm/cold).
 */
router.get('/balances', async (req: AuthenticatedRequest, res: Response) => {
  const wallets = await getWalletsForUser(req.userId!);
  res.json(wallets);
});

/**
 * GET /api/wallet/policy
 * Withdrawal policy (backend.md §5.1: rate limiting, caps).
 */
router.get('/policy', (req: AuthenticatedRequest, res: Response) => {
  res.json({
    processingTimeFiat: '1–3 business days',
    processingTimeCrypto: 'Instant to whitelisted wallets',
    withdrawalFee: '$0',
    networkFees: 'Passed at cost',
    dailyCap: req.user!.withdrawalCap,
    requiresMultiSig: true,
    // 2FA is no longer required per §5.1
  });
});

/**
 * POST /api/wallet/deposit
 * Generates a unique deposit address. KYC must be APPROVED (backend.md §4.2).
 */
router.post('/deposit', requireKycApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { asset, amount } = req.body;
  const userId = req.userId!;

  if (!SUPPORTED_ASSETS.includes(asset)) {
    res.status(400).json({ error: `Unsupported asset. Supported: ${SUPPORTED_ASSETS.join(', ')}` });
    return;
  }
  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'Amount must be positive' });
    return;
  }

  let address = await getDepositAddress(userId, asset);
  if (!address) {
    address = {
      address: `deposit_${asset}_${nanoid(32)}`,
      userId,
      asset,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    await addDepositAddress(address);
  }

  // Append-only ledger entry (backend.md §4.4)
  const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
  await appendLedgerEntry(userId, asset, amount, 'deposit', txId);

  const tx: Transaction = {
    id: txId,
    userId,
    date: new Date().toISOString(),
    type: 'Deposit',
    asset,
    amount,
    strategy: 'Pending Allocation',
    status: 'Processing',
    txHash: `0x${nanoid(16)}`,
  };
  await addTransaction(tx);
  await addAuditLog(userId, 'DEPOSIT', `${asset} ${amount} deposit initiated to ${address.address}`);

  res.status(201).json({
    depositAddress: address.address,
    transaction: tx,
    message: 'Deposit initiated. Funds will be credited once confirmed on-chain.',
  });
});

/**
 * POST /api/wallet/withdraw
 * Creates a withdrawal request requiring multi-sig approval (Admin + Compliance).
 */
router.post('/withdraw', requireKycApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { asset, amount, destinationAddress } = req.body;
  const user = req.user!;

  if (!SUPPORTED_ASSETS.includes(asset)) {
    res.status(400).json({ error: `Unsupported asset. Supported: ${SUPPORTED_ASSETS.join(', ')}` });
    return;
  }
  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'Amount must be positive' });
    return;
  }
  if (!destinationAddress) {
    res.status(400).json({ error: 'Destination address is required' });
    return;
  }
  if (amount > user.withdrawalCap) {
    res.status(400).json({ error: `Amount exceeds daily withdrawal cap of $${user.withdrawalCap}` });
    return;
  }

  const txId = `TX-${Math.floor(100000 + Math.random() * 900000)}`;
  const tx: Transaction = {
    id: txId,
    userId: user.id,
    date: new Date().toISOString(),
    type: 'Withdrawal',
    asset,
    amount,
    strategy: 'Client Withdrawal',
    status: 'Pending',
    txHash: `0x${nanoid(16)}`,
    requiresApproval: true,
    approval1: false,
    approval2: false,
  };
  await addWithdrawalRequest(tx);
  await addTransaction(tx);
  await addAuditLog(user.id, 'WITHDRAWAL_REQUESTED', `${asset} ${amount} withdrawal to ${destinationAddress}`);

  res.status(201).json({
    transaction: tx,
    message: 'Withdrawal request submitted. Requires Admin + Compliance approval before execution.',
  });
});

/**
 * GET /api/wallet/withdrawals (admin/compliance)
 * Lists pending withdrawal requests for multi-sig approval.
 */
router.get(
  '/withdrawals',
  requireRole('admin', 'compliance'),
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getWithdrawalRequests());
  }
);

/**
 * POST /api/wallet/withdrawals/:id/approve (admin/compliance)
 * Multi-sig approval: requires BOTH admin and compliance sign-off.
 */
router.post(
  '/withdrawals/:id/approve',
  requireRole('admin', 'compliance'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const approver = req.user!;
    const requests = await getWithdrawalRequests();
    const tx = requests.find((t) => t.id === id);

    if (!tx) {
      res.status(404).json({ error: 'Withdrawal request not found' });
      return;
    }
    if (tx.status !== 'Pending') {
      res.status(400).json({ error: 'Withdrawal already processed' });
      return;
    }

    if (approver.role === 'admin') tx.approval1 = true;
    if (approver.role === 'compliance') tx.approval2 = true;

    await addAuditLog(tx.userId, 'WITHDRAWAL_APPROVAL', `${approver.role} approved withdrawal ${tx.id}`);

    // Execute only when both signatures are present (backend.md §4.3)
    if (tx.approval1 && tx.approval2) {
      tx.status = 'Completed';
      await appendLedgerEntry(tx.userId, tx.asset, -tx.amount, 'withdrawal', tx.id);
      await addAuditLog(tx.userId, 'WITHDRAWAL_EXECUTED', `${tx.asset} ${tx.amount} withdrawal executed`);
      await updateWithdrawalRequest(tx.id, { status: 'Completed' });
      res.json({ transaction: tx, message: 'Withdrawal approved by both parties and executed.' });
    } else {
      await updateWithdrawalRequest(tx.id, { approval1: tx.approval1, approval2: tx.approval2 });
      res.json({
        transaction: tx,
        message: `Approval recorded (${approver.role}). Waiting for the other signatory.`,
      });
    }
  }
);

export default router;