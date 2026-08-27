import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import {
  getAuditLogs,
  getAllLedger,
  getAllTransactions,
  getAllUsers,
  getDbStats,
  getWithdrawalRequests,
  setKycStatus,
  setUserRole,
  findUserById,
  addTransaction,
  addAuditLog,
  appendLedgerEntry,
  verifyLedgerIntegrity,
  type User,
  type UserRole,
  type KYCStatus,
  type Transaction,
  type LedgerEntry,
} from '../db/index.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

const STAFF = ['admin', 'compliance'] as const;
const VALID_ROLES: UserRole[] = ['client', 'admin', 'compliance'];
const VALID_KYC: KYCStatus[] = ['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED'];

// ---------- Helpers ----------

/** Net deposited value (USD) for a user derived from the append-only ledger. */
function netDeposited(ledger: LedgerEntry[], userId: string): number {
  return ledger
    .filter((e) => e.userId === userId && (e.entryType === 'deposit' || e.entryType === 'withdrawal'))
    .reduce((sum, e) => sum + e.amount, 0);
}

function accountSummary(user: User, ledger: LedgerEntry[], txns: Transaction[]) {
  const userTxns = txns.filter((t) => t.userId === user.id);
  const deposits = userTxns.filter((t) => t.type === 'Deposit' && t.status === 'Completed').reduce((s, t) => s + t.amount, 0);
  const withdrawals = userTxns.filter((t) => t.type === 'Withdrawal' && t.status === 'Completed').reduce((s, t) => s + t.amount, 0);
  const pendingWithdrawals = userTxns.filter((t) => t.type === 'Withdrawal' && t.status !== 'Completed');
  const processingDeposits = userTxns.filter((t) => t.type === 'Deposit' && t.status === 'Processing');

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    kycStatus: user.kycStatus,
    createdAt: user.createdAt,
    withdrawalCap: user.withdrawalCap,
    balance: netDeposited(ledger, user.id),
    deposits,
    withdrawals,
    pendingWithdrawals: pendingWithdrawals.map((t) => ({
      id: t.id,
      asset: t.asset,
      amount: t.amount,
      status: t.status,
      approvals: (t.approval1 ? 1 : 0) + (t.approval2 ? 1 : 0),
    })),
    processingDeposits: processingDeposits.length,
    transactionCount: userTxns.length,
  };
}

// ---------- Dashboard / overview ----------

/**
 * GET /api/admin/dashboard
 * System-wide KPIs so admins can "see everything" at a glance.
 */
router.get(
  '/dashboard',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const [users, txns, ledger, withdrawals, audit] = await Promise.all([
      getAllUsers(),
      getAllTransactions(),
      getAllLedger(),
      getWithdrawalRequests(),
      getAuditLogs(),
    ]);

    const totalAUM = ledger
      .filter((e) => e.entryType === 'deposit' || e.entryType === 'withdrawal')
      .reduce((s, e) => s + e.amount, 0);

    const completedDeposits = txns
      .filter((t) => t.type === 'Deposit' && t.status === 'Completed')
      .reduce((s, t) => s + t.amount, 0);
    const completedWithdrawals = txns
      .filter((t) => t.type === 'Withdrawal' && t.status === 'Completed')
      .reduce((s, t) => s + t.amount, 0);
    const fees = txns
      .filter((t) => t.type === 'Fee')
      .reduce((s, t) => s + t.amount, 0);
    const pendingWithdrawals = withdrawals.filter((t) => t.status === 'Pending');
    const processingDeposits = txns.filter((t) => t.type === 'Deposit' && t.status === 'Processing');

    res.json({
      stats: {
        totalUsers: users.length,
        clients: users.filter((u) => u.role === 'client').length,
        staff: users.filter((u) => u.role !== 'client').length,
        pendingKyc: users.filter((u) => u.kycStatus !== 'APPROVED').length,
        totalAUM,
        completedDeposits,
        completedWithdrawals,
        fees,
        pendingWithdrawals: pendingWithdrawals.length,
        pendingWithdrawalAmount: pendingWithdrawals.reduce((s, w) => s + w.amount, 0),
        processingDeposits: processingDeposits.length,
        transactionCount: txns.length,
        ledgerEntries: ledger.length,
        auditCount: audit.length,
      },
      recentTransactions: txns.slice(0, 8),
    });
  }
);

// ---------- Accounts ----------

/**
 * GET /api/admin/users
 * Every account with derived balances and pending actions.
 */
router.get(
  '/users',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const [users, txns, ledger] = await Promise.all([
      getAllUsers(),
      getAllTransactions(),
      getAllLedger(),
    ]);
    res.json(users.map((u) => accountSummary(u, ledger, txns)));
  }
);

/**
 * POST /api/admin/users/:id/kyc
 * Update a client's KYC status (approve / reject / set pending).
 */
router.post(
  '/users/:id/kyc',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const { status } = req.body as { status: KYCStatus };
    const user = await findUserById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (!VALID_KYC.includes(status)) {
      res.status(400).json({ error: `Invalid KYC status. Valid: ${VALID_KYC.join(', ')}` });
      return;
    }
    await setKycStatus(id, status);
    await addAuditLog(id, 'KYC_STATUS_CHANGED', `KYC set to ${status} by ${req.user!.email}`);
    res.json({ userId: id, status });
  }
);

/**
 * POST /api/admin/users/:id/role
 * Promote/demote an account role. Admin only.
 */
router.post(
  '/users/:id/role',
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const { role } = req.body as { role: UserRole };
    const user = await findUserById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (!VALID_ROLES.includes(role)) {
      res.status(400).json({ error: `Invalid role. Valid: ${VALID_ROLES.join(', ')}` });
      return;
    }
    await setUserRole(id, role);
    await addAuditLog(id, 'ROLE_CHANGED', `Role set to ${role} by ${req.user!.email}`);
    res.json({ userId: id, role });
  }
);

// ---------- Funds ----------

/**
 * POST /api/admin/users/:id/deposit
 * Manually credit a client's account (admin control of funds).
 * Records a completed deposit and a ledger entry.
 * Body: { asset, amount, note? }
 */
router.post(
  '/users/:id/deposit',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const { asset, amount, note } = req.body as { asset: string; amount: number; note?: string };
    const user = await findUserById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (!asset || !amount || amount <= 0) {
      res.status(400).json({ error: 'A positive asset and amount are required' });
      return;
    }

    const txId = `TX-${nanoid(12)}`;
    const tx: Transaction = {
      id: txId,
      userId: id,
      date: new Date().toISOString(),
      type: 'Deposit',
      asset,
      amount,
      strategy: note || 'Manual Admin Credit',
      status: 'Completed',
      txHash: `admin_${nanoid(12)}`,
    };
    await addTransaction(tx);
    await appendLedgerEntry(id, asset, amount, 'deposit', txId);
    await addAuditLog(id, 'ADMIN_DEPOSIT', `Admin credited ${amount} ${asset} (${txId}) by ${req.user!.email}`);

    res.status(201).json({ transaction: tx, message: `Credited ${amount} ${asset} to ${user.email}` });
  }
);

/**
 * POST /api/admin/transactions/:id/confirm-deposit
 * Confirm a client-submitted (Processing) crypto deposit and credit the account.
 * Body: { amount }
 */
router.post(
  '/transactions/:id/confirm-deposit',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const { amount } = req.body as { amount?: number };
    const txns = await getAllTransactions();
    const tx = txns.find((t) => t.id === id && t.type === 'Deposit');

    if (!tx) {
      res.status(404).json({ error: 'Deposit transaction not found' });
      return;
    }
    if (tx.status === 'Completed') {
      res.status(400).json({ error: 'Deposit already confirmed' });
      return;
    }
    if (!amount || amount <= 0) {
      res.status(400).json({ error: 'A positive amount is required to confirm the deposit' });
      return;
    }

    const updated: Transaction = { ...tx, amount, status: 'Completed', strategy: tx.strategy || 'Crypto Deposit' };
    await addTransaction(updated);
    await appendLedgerEntry(tx.userId, tx.asset, amount, 'deposit', tx.id);
    await addAuditLog(tx.userId, 'DEPOSIT_CONFIRMED', `Deposit ${tx.id} confirmed for ${amount} ${tx.asset} by ${req.user!.email}`);

    res.json({ transaction: updated, message: `Deposit ${tx.id} confirmed and credited with ${amount} ${tx.asset}.` });
  }
);

/**
 * POST /api/admin/transactions/:id/deny-deposit
 * Reject/cancel a client-submitted deposit that cannot be verified.
 */
router.post(
  '/transactions/:id/deny-deposit',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const txns = await getAllTransactions();
    const tx = txns.find((t) => t.id === id && t.type === 'Deposit');

    if (!tx) {
      res.status(404).json({ error: 'Deposit transaction not found' });
      return;
    }
    if (tx.status === 'Completed') {
      res.status(400).json({ error: 'Deposit already confirmed' });
      return;
    }

    const updated: Transaction = { ...tx, status: 'Cancelled', strategy: `${tx.strategy || 'Deposit'} (Denied)` };
    await addTransaction(updated);
    await addAuditLog(tx.userId, 'DEPOSIT_DENIED', `Deposit ${tx.id} denied by ${req.user!.email}`);

    res.json({ transaction: updated, message: `Deposit ${tx.id} denied. No funds credited.` });
  }
);

// ---------- Transactions / ledger / audit ----------

/**
 * GET /api/admin/transactions
 * Every transaction across all clients, joined with account identity.
 */
router.get(
  '/transactions',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const [txns, users] = await Promise.all([getAllTransactions(), getAllUsers()]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    res.json(
      txns.map((t) => ({
        ...t,
        userEmail: userMap.get(t.userId)?.email ?? 'unknown',
        userName: userMap.get(t.userId)?.name ?? 'unknown',
      }))
    );
  }
);

/**
 * GET /api/admin/ledger (admin/compliance)
 * Full append-only ledger.
 */
router.get(
  '/ledger',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getAllLedger());
  }
);

/**
 * GET /api/admin/ledger/verify (admin/compliance)
 * Verifies the cryptographic hash chain of the ledger.
 * Detects any tampering with financial records (backend.md §4.4).
 */
router.get(
  '/ledger/verify',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await verifyLedgerIntegrity();
    await addAuditLog(req.userId!, 'LEDGER_VERIFY', `Integrity check: ${result.valid ? 'OK' : 'TAMPERED'} (${result.checked} entries)`);
    res.json(result);
  }
);

/**
 * GET /api/admin/audit-logs (admin/compliance)
 * Immutable admin audit trail (backend.md §4.6).
 */
router.get(
  '/audit-logs',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getAuditLogs());
  }
);

/**
 * GET /api/admin/stats (admin/compliance)
 * Raw system-wide statistics.
 */
router.get(
  '/stats',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getDbStats());
  }
);

export default router;
