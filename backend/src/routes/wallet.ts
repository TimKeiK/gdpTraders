import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import {
  addTransaction,
  addWithdrawalRequest,
  addAuditLog,
  appendLedgerEntry,
  getWalletsForUser,
  getWithdrawalRequests,
  updateWithdrawalRequest,
  type Transaction,
} from '../db/index.js';
import { requireAuth, requireKycApproved, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { SUPPORTED_ASSETS } from '../data/strategies.js';

// ---- Card payment processing ---------------------------------------------
// Deposits are card-only. Real card charges are processed by Stripe's
// Payment Intents API (server-side, through the REST endpoint — card details
// are never stored by us). When STRIPE_SECRET_KEY is not configured, a MOCK
// card processor is used so the flow can be exercised in development without
// charging a real card.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

interface PaymentIntent {
  id: string;
  clientSecret: string;
  currency: string;
  amount: number; // in dollars
  metadata: Record<string, string>;
  status: string;
}

// Mock intents store (dev/demo only — used when STRIPE_SECRET_KEY is unset)
const mockIntents = new Map<string, PaymentIntent>();

function metadataToParams(metadata: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata).map(([k, v]) => [`metadata[${k}]`, v]));
}

async function stripeApi(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  params: Record<string, string> = {},
): Promise<any> {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(method === 'POST' ? { body } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Stripe API error (${res.status}): ${text}`);
  }
  return res.json();
}

async function createPaymentIntent(params: {
  amount: number; // in dollars
  currency: string;
  description: string;
  metadata: Record<string, string>;
}): Promise<PaymentIntent> {
  if (STRIPE_SECRET_KEY) {
    const intent = await stripeApi('/payment_intents', 'POST', {
      amount: String(Math.round(params.amount * 100)),
      currency: params.currency,
      description: params.description,
      'payment_method_types[]': 'card',
      ...metadataToParams(params.metadata),
    });
    return {
      id: intent.id,
      clientSecret: intent.client_secret,
      currency: intent.currency,
      amount: params.amount,
      metadata: params.metadata,
      status: intent.status,
    };
  }

  // Mock processor (dev/demo) — no real card is charged.
  console.warn(
    '[wallet] STRIPE_SECRET_KEY not set — using MOCK card processor. ' +
      'Deposits are simulated and NOT charged. Set STRIPE_SECRET_KEY to enable real card payments.',
  );
  const mock: PaymentIntent = {
    id: `pi_mock_${nanoid(16)}`,
    clientSecret: `sk_test_mock_${nanoid(16)}`,
    currency: params.currency,
    amount: params.amount,
    metadata: params.metadata,
    status: 'succeeded',
  };
  mockIntents.set(mock.id, mock);
  return mock;
}

async function retrievePaymentIntent(id: string): Promise<PaymentIntent | null> {
  if (STRIPE_SECRET_KEY) {
    const intent = await stripeApi(`/payment_intents/${id}`);
    return {
      id: intent.id,
      clientSecret: intent.client_secret,
      currency: intent.currency,
      amount: Number(intent.amount) / 100,
      metadata: intent.metadata ?? {},
      status: intent.status,
    };
  }
  return mockIntents.get(id) ?? null;
}

const router = Router();

router.use(requireAuth);

/**
 * Constant deposit wallet addresses (configured per asset)
 * In production, these should be from your secure custody system
 */
const DEPOSIT_WALLET_ADDRESSES: Record<string, string> = {
  USDT: process.env.DEPOSIT_WALLET_USDT || 'TUc2wxZTmfseu42idSDdhKDT35eyUiWwwp',
  BTC: process.env.DEPOSIT_WALLET_BTC || '0x69276bb6ccd6927ac2623a6b18601ce2d48efda3',
  ETH: process.env.DEPOSIT_WALLET_ETH || '0x69276bb6ccd6927ac2623a6b18601ce2d48efda3',
};

/**
 * GET /api/wallet/deposit-address
 * Returns the constant deposit wallet address for the specified asset
 */
router.get('/deposit-address/:asset', async (req: AuthenticatedRequest, res: Response) => {
  const asset = req.params.asset as string;
  
  if (!SUPPORTED_ASSETS.includes(asset)) {
    res.status(400).json({ error: `Unsupported asset. Supported: ${SUPPORTED_ASSETS.join(', ')}` });
    return;
  }

  const address = DEPOSIT_WALLET_ADDRESSES[asset];
  if (!address) {
    res.status(500).json({ error: 'Deposit wallet not configured for this asset' });
    return;
  }

  res.json({
    asset,
    address,
    message: 'Funds purchased by card are delivered to this constant custodial wallet.',
  });
});

/**
 * GET /api/wallet/addresses
 * Returns the user's deposit addresses per asset.
 */
router.get('/addresses', async (req: AuthenticatedRequest, res: Response) => {
  const addresses = SUPPORTED_ASSETS.map(asset => ({
    address: DEPOSIT_WALLET_ADDRESSES[asset],
    asset,
    isActive: true,
    createdAt: new Date().toISOString(),
  }));
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
 * Creates a card Payment Intent (Stripe) for the deposit.
 * Deposits are card-only and the purchased asset is delivered to a constant
 * custodial crypto wallet (DEPOSIT_WALLET_ADDRESSES) — there is no manual
 * crypto-transfer address flow.
 * KYC must be APPROVED (backend.md §4.2).
 * 
 * Body: { asset: 'USDT', amount: 1000 }
 * Response: { clientSecret, paymentIntentId, amount, asset, depositAddress }
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

  const depositAddress = DEPOSIT_WALLET_ADDRESSES[asset];
  if (!depositAddress) {
    res.status(500).json({ error: 'Deposit wallet not configured for this asset' });
    return;
  }

  try {
    // Create a Stripe Payment Intent. Amount is in cents, so multiply by 100.
    const intent = await createPaymentIntent({
      amount,
      currency: 'usd',
      description: `Deposit ${amount} USD as ${asset} to GDPTraders`,
      metadata: { userId, asset, depositAddress },
    });

    res.status(201).json({
      clientSecret: intent.clientSecret,
      paymentIntentId: intent.id,
      amount,
      asset,
      depositAddress,
      message: 'Payment intent created. Complete the card payment to deposit funds into the custodial wallet.',
    });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

/**
 * POST /api/wallet/deposit-confirm
 * Confirms a successful card deposit and credits the user's account.
 * Called after the Stripe card payment succeeds.
 * 
 * Body: { paymentIntentId, asset, amount }
 */
router.post('/deposit-confirm', requireKycApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { paymentIntentId, asset, amount } = req.body;
  const userId = req.userId!;

  if (!SUPPORTED_ASSETS.includes(asset) || !amount || amount <= 0) {
    res.status(400).json({ error: 'Invalid asset or amount' });
    return;
  }

  const depositAddress = DEPOSIT_WALLET_ADDRESSES[asset];

  try {
    // Verify the card payment intent (real Stripe or mock).
    const intent = await retrievePaymentIntent(paymentIntentId);
    if (!intent || intent.status !== 'succeeded') {
      res.status(400).json({ error: 'Payment has not been completed' });
      return;
    }

    // Record deposit in ledger
    const txId = `TX-${nanoid(12)}`;
    await appendLedgerEntry(userId, asset, amount, 'deposit', txId);

    // Create transaction record
    const tx: Transaction = {
      id: txId,
      userId,
      date: new Date().toISOString(),
      type: 'Deposit',
      asset,
      amount,
      strategy: 'Pending Allocation',
      status: 'Completed',
      txHash: paymentIntentId,
    };
    await addTransaction(tx);
    
    // Audit log
    await addAuditLog(
      userId,
      'DEPOSIT',
      `Card deposit confirmed: ${amount} USD as ${asset} delivered to custodial wallet ${depositAddress} (${paymentIntentId})`
    );

    res.status(201).json({
      transaction: tx,
      depositAddress,
      message: `Deposit confirmed. Your ${asset} has been delivered to the custodial wallet and credited to your account.`,
    });
  } catch (err) {
    console.error('Deposit confirmation error:', err);
    res.status(500).json({ error: 'Failed to confirm deposit' });
  }
});

/**
 * POST /api/wallet/crypto-deposit
 * Records a crypto deposit submitted by the user via manual wallet transfer.
 * The user sends the selected asset to the constant custodial deposit wallet
 * (DEPOSIT_WALLET_ADDRESSES), then notifies us to verify the on-chain transfer.
 * The deposit is recorded as Processing until confirmed.
 *
 * Body: { asset: 'USDT' }
 */
router.post('/crypto-deposit', requireKycApproved, async (req: AuthenticatedRequest, res: Response) => {
  const { asset } = req.body;
  const userId = req.userId!;

  if (!SUPPORTED_ASSETS.includes(asset)) {
    res.status(400).json({ error: `Unsupported asset. Supported: ${SUPPORTED_ASSETS.join(', ')}` });
    return;
  }

  const depositAddress = DEPOSIT_WALLET_ADDRESSES[asset];
  if (!depositAddress) {
    res.status(500).json({ error: 'Deposit wallet not configured for this asset' });
    return;
  }

  // Create a pending deposit transaction (on-chain verification is pending).
  const txId = `TX-${nanoid(12)}`;
  const tx: Transaction = {
    id: txId,
    userId,
    date: new Date().toISOString(),
    type: 'Deposit',
    asset,
    amount: 0,
    strategy: 'Pending Allocation',
    status: 'Processing',
    txHash: `0x${nanoid(16)}`,
  };
  await addTransaction(tx);
  await addAuditLog(
    userId,
    'DEPOSIT_SUBMITTED',
    `User reported sending ${asset} to custodial wallet ${depositAddress} (${txId})`
  );

  res.status(201).json({
    transaction: tx,
    depositAddress,
    message: `Deposit recorded. We will verify your ${asset} transfer on the blockchain and credit your account once confirmed.`,
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