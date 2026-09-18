import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import {
  getAuditLogs,
  getAllLedger,
  getLedgerForUser,
  getAllTransactions,
  getAllUsers,
  getDbStats,
  getWithdrawalRequests,
  setKycStatus,
  setUserRole,
  setAvailableWithdrawal,
  findUserById,
  addTransaction,
  addAuditLog,
  appendLedgerEntry,
  verifyLedgerIntegrity,
  getAllReferralEarnings,
  getReferredUserIds,
  getReferralEarningsForUser,
  appendDepositAndReferralCommission,
  getActiveInvestmentForUser,
  addInvestment,
  updateInvestment,
  getAccrualSummary,
  type User,
  type UserRole,
  type KYCStatus,
  type Transaction,
  type LedgerEntry,
  type Investment,
} from '../db/index.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';
import { recordInvestmentForDeposit } from './wallet.js';
import {
  getPlanByAmount,
  getPlanByName,
  INVESTMENT_PLANS,
  addWorkingDays,
  computeExpectedReturn,
  workingDaysBetween,
  MIN_DEPOSIT,
} from '../data/plans.js';
import { investmentTermSummary, storedDateYmd, toYmd } from '../data/accrual.js';
import { runInvestmentAccrual, getSchedulerStatus } from '../services/accrual.js';
import { config } from '../config.js';

const router = Router();

router.use(requireAuth);

const STAFF = ['admin', 'compliance'] as const;
const VALID_ROLES: UserRole[] = ['client', 'admin', 'compliance'];
const VALID_KYC: KYCStatus[] = ['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED'];

// ---------- Helpers ----------

/**
 * Full portfolio value for a user derived from the ledger — the SAME formula
 * as /portfolio/summary (all entry types: deposits + withdrawals + trades +
 * fees + interest) so the admin view can never disagree with what the client
 * sees on their own overview page.
 */
function portfolioValue(ledger: LedgerEntry[], userId: string): number {
  return ledger
    .filter((e) => e.userId === userId)
    .reduce((sum, e) => sum + e.amount, 0);
}

function accountSummary(user: User, ledger: LedgerEntry[], txns: Transaction[]) {
  const userTxns = txns.filter((t) => t.userId === user.id);
  const userLedger = ledger.filter((e) => e.userId === user.id);
  const deposits = userTxns.filter((t) => t.type === 'Deposit' && t.status === 'Completed').reduce((s, t) => s + t.amount, 0);
  const withdrawals = userTxns.filter((t) => t.type === 'Withdrawal' && t.status === 'Completed').reduce((s, t) => s + t.amount, 0);

  // Admin-managed Profit & Loss (backend.md §4.4):
  // - every admin CREDIT appends a 'profit' ledger entry (positive amount)
  // - every admin DEBIT appends a 'loss' ledger entry (negative amount)
  const totalProfit = userLedger.filter((e) => e.entryType === 'profit').reduce((s, e) => s + e.amount, 0);
  const totalLoss = userLedger.filter((e) => e.entryType === 'loss').reduce((s, e) => s + Math.abs(e.amount), 0);

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
    availableWithdrawal: user.availableWithdrawal ?? 0,
    balance: portfolioValue(ledger, user.id),
    deposits,
    withdrawals,
    totalProfit,
    totalLoss,
    netPnl: totalProfit - totalLoss,
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

    // AUM = what clients collectively hold right now. This must use the same
    // formula as /portfolio/summary (full ledger incl. trading P&L) so the
    // admin view can never disagree with the sum of client portfolios.
    const totalAUM = ledger.reduce((s, e) => s + e.amount, 0);

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

    // Platform-wide Profit & Loss managed by admins (§4.4 ledger entry types).
    const totalProfit = ledger.filter((e) => e.entryType === 'profit').reduce((s, e) => s + e.amount, 0);
    const totalLoss = ledger.filter((e) => e.entryType === 'loss').reduce((s, e) => s + Math.abs(e.amount), 0);

    res.json({
      stats: {
        totalUsers: users.length,
        clients: users.filter((u) => u.role === 'client').length,
        staff: users.filter((u) => u.role !== 'client').length,
        pendingKyc: users.filter((u) => u.kycStatus !== 'APPROVED').length,
        totalAUM,
        totalProfit,
        totalLoss,
        netPnl: totalProfit - totalLoss,
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
    const userMap = new Map(users.map((u) => [u.id, u]));
    res.json(
      await Promise.all(
        users.map(async (u) => {
          const activeInv = await getActiveInvestmentForUser(u.id);
          return {
            ...accountSummary(u, ledger, txns),
            // Referral surfacing for KYC/AML chain tracing (compliance).
            referredBy: u.referredByUserId
              ? (() => {
                  const r = userMap.get(u.referredByUserId!);
                  return r ? { id: r.id, name: r.name, email: r.email } : null;
                })()
              : null,
            referredCount: (await getReferredUserIds(u.id)).length,
            // The client's active investment (admin plan override display).
            investment: activeInv
              ? {
                  id: activeInv.id,
                  planName: activeInv.assignedPlan,
                  initialDeposit: activeInv.initialDeposit,
                  dailyRate: activeInv.dailyRate,
                  durationDays: activeInv.durationDays,
                  startDate: activeInv.startDate,
                  endDate: activeInv.endDate,
                  totalExpectedReturn: activeInv.totalExpectedReturn,
                  status: activeInv.status,
                }
              : null,
          };
        })
      )
    );
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
 * POST /api/admin/users/:id/withdrawal-amount
 * Set how much a client can currently withdraw (from their initial deposit
 * plus any profit). The client sees this as "Available withdrawal" on their
 * dashboard. Staff (admin/compliance) can grant or revoke withdrawal access.
 * Body: { amount }
 */
router.post(
  '/users/:id/withdrawal-amount',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const { amount } = req.body as { amount: number };
    const user = await findUserById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed < 0) {
      res.status(400).json({ error: 'Amount must be a non-negative number' });
      return;
    }
    await setAvailableWithdrawal(id, parsed);
    await addAuditLog(
      id,
      'WITHDRAWAL_AMOUNT_SET',
      `Available withdrawal set to ${parsed} by ${req.user!.email}`
    );
    res.json({ userId: id, availableWithdrawal: parsed });
  }
);

/**
 * POST /api/admin/users/:id/investment-plan
 * Admin override: change or set a client's active investment plan. The client's
 * Overview and Profile Settings pages both read straight from the investments
 * table (GET /wallet/investment), so an override here reflects there immediately.
 * The row is flagged planOverride so the amount-based runtime fallback does not
 * revert it. Body: { planName } — one of Bronze/Silver/Diamond/Gold/Rhodium.
 */
router.post(
  '/users/:id/investment-plan',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const { planName } = req.body as { planName?: string };
    const user = await findUserById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const plan = planName ? getPlanByName(planName) : null;
    if (!plan) {
      res.status(400).json({
        error: `Unknown investment plan. Valid: ${INVESTMENT_PLANS.map((p) => p.name).join(', ')}`,
      });
      return;
    }

    let inv = await getActiveInvestmentForUser(id);

    if (!inv) {
      // No active investment yet (e.g. the client never reached the plan
      // minimum). Derive the initial deposit from the ledger's confirmed
      // deposits, falling back to the plan minimum so the expected return is
      // still meaningful — then create a new active plan record.
      const ledger = await getLedgerForUser(id);
      const initialDeposit = ledger
        .filter((e) => e.entryType === 'deposit')
        .reduce((sum, e) => sum + e.amount, 0) || plan.min;
      const startDate = new Date();
      inv = {
        id: `INV-${nanoid(10)}`,
        userId: id,
        initialDeposit,
        assignedPlan: plan.name,
        dailyRate: plan.dailyRate,
        durationDays: plan.durationDays,
        startDate: startDate.toISOString(),
        endDate: addWorkingDays(startDate, plan.durationDays).toISOString(),
        totalExpectedReturn: computeExpectedReturn(initialDeposit, plan.dailyRate, plan.durationDays),
        status: 'active',
        planOverride: true,
      };
      await addInvestment(inv);
    } else {
      const updated: Investment = {
        ...inv,
        assignedPlan: plan.name,
        dailyRate: plan.dailyRate,
        durationDays: plan.durationDays,
        // Recompute the maturity date from the (unchanged) start date so the
        // "days remaining" counter reflects the new duration.
        endDate: addWorkingDays(new Date(inv.startDate), plan.durationDays).toISOString(),
        totalExpectedReturn: computeExpectedReturn(inv.initialDeposit, plan.dailyRate, plan.durationDays),
        status: 'active',
        planOverride: true,
      };
      await updateInvestment(updated);
      inv = updated;
    }

    await addAuditLog(
      id,
      'INVESTMENT_PLAN_SET',
      `Investment plan overridden to ${plan.name} (${plan.dailyRate}% daily, ${plan.durationDays} working days) by ${req.user!.email}`
    );

    res.json({
      userId: id,
      investment: {
        planName: inv.assignedPlan,
        dailyRate: inv.dailyRate,
        durationDays: inv.durationDays,
        totalExpectedReturn: inv.totalExpectedReturn,
      },
      message: `Investment plan for ${user.email} set to ${plan.name} Plan.`,
    });
  }
);

/**
 * POST /api/admin/users/:id/initial-deposit
 * Admin override: change a client's initial deposit — the amount shown on their
 * Overview / Profile Settings investment card. When the client's plan is NOT
 * admin-overridden, the plan is re-derived from the new amount (same logic as a
 * real deposit assigning a plan); when it IS overridden, the plan is kept and
 * only the amount / expected return are updated. Body: { amount }
 */
router.post(
  '/users/:id/initial-deposit',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const { amount } = req.body as { amount?: number };
    const user = await findUserById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      res.status(400).json({ error: 'Initial deposit must be a positive number.' });
      return;
    }

    let inv = await getActiveInvestmentForUser(id);
    const isOverride = inv?.planOverride ?? false;

    let planName: string;
    let dailyRate: number;
    let durationDays: number;
    if (inv && isOverride) {
      // Admin-assigned plan is kept regardless of the new amount.
      planName = inv.assignedPlan!;
      dailyRate = inv.dailyRate!;
      durationDays = inv.durationDays!;
    } else {
      const plan = getPlanByAmount(parsed);
      if (!plan) {
        res.status(400).json({
          error: `Initial deposit must be at least $${MIN_DEPOSIT} (${INVESTMENT_PLANS[0].name} Plan minimum).`,
        });
        return;
      }
      planName = plan.name;
      dailyRate = plan.dailyRate;
      durationDays = plan.durationDays;
    }

    if (!inv) {
      const startDate = new Date();
      inv = {
        id: `INV-${nanoid(10)}`,
        userId: id,
        initialDeposit: parsed,
        assignedPlan: planName,
        dailyRate,
        durationDays,
        startDate: startDate.toISOString(),
        endDate: addWorkingDays(startDate, durationDays).toISOString(),
        totalExpectedReturn: computeExpectedReturn(parsed, dailyRate, durationDays),
        status: 'active',
        planOverride: false,
      };
      await addInvestment(inv);
    } else {
      const updated: Investment = {
        ...inv,
        initialDeposit: parsed,
        assignedPlan: planName,
        dailyRate,
        durationDays,
        endDate: addWorkingDays(new Date(inv.startDate), durationDays).toISOString(),
        totalExpectedReturn: computeExpectedReturn(parsed, dailyRate, durationDays),
        status: 'active',
      };
      await updateInvestment(updated);
      inv = updated;
    }

    await addAuditLog(
      id,
      'INVESTMENT_DEPOSIT_SET',
      `Initial deposit overridden to ${parsed} (plan: ${inv.assignedPlan}) by ${req.user!.email}`
    );

    res.json({
      userId: id,
      investment: {
        initialDeposit: inv.initialDeposit,
        planName: inv.assignedPlan,
        dailyRate: inv.dailyRate,
        durationDays: inv.durationDays,
        totalExpectedReturn: inv.totalExpectedReturn,
      },
      message: `Initial deposit for ${user.email} set to ${parsed} (${inv.assignedPlan} Plan).`,
    });
  }
);

/**
 * POST /api/admin/users/:id/deposit
 * Manually credit a client's account (admin control of funds).
 * An admin credit IS PROFIT: it records a completed deposit transaction
 * AND appends a 'profit' entry to the append-only ledger so it shows up
 * in the client's P&L (client portal) and the platform P&L (admin portal).
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
      strategy: note || 'Profit credited by admin',
      status: 'Completed',
      txHash: `admin_${nanoid(12)}`,
    };
    await addTransaction(tx);
    // Admin credit == PROFIT: append a 'profit' ledger entry (positive amount)
    // so the client's P&L and the admin P&L dashboards reflect it.
    await appendLedgerEntry(id, asset, amount, 'profit', txId);
    // Keep "Available withdrawal" in sync with credited profit: every credit
    // raises the amount the client can withdraw by the same amount, so the
    // client's dashboard Total Profit and Available Withdrawal match.
    await setAvailableWithdrawal(id, (user.availableWithdrawal ?? 0) + amount);
    await addAuditLog(id, 'ADMIN_CREDIT_PROFIT', `Admin credited ${amount} ${asset} as PROFIT (${txId}) by ${req.user!.email}. Available withdrawal increased to ${(user.availableWithdrawal ?? 0) + amount}.`);

    res.status(201).json({ transaction: tx, availableWithdrawal: (user.availableWithdrawal ?? 0) + amount, message: `Credited ${amount} ${asset} to ${user.email} (recorded as profit). Available withdrawal is now ${(user.availableWithdrawal ?? 0) + amount}.` });
  }
);

/**
 * POST /api/admin/users/:id/debit
 * Manually debit a client's account (admin control of funds).
 * An admin debit IS LOSS: it records a completed withdrawal transaction
 * AND appends a 'loss' entry (negative amount) to the append-only ledger
 * so it reduces the client's balance and shows up as a loss in the P&L
 * on both the client portal and the admin portal.
 * Body: { asset, amount, note? }
 */
router.post(
  '/users/:id/debit',
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

    // Never allow a debit that would push the balance negative.
    const ledger = await getAllLedger();
    const balance = portfolioValue(ledger, id);
    if (amount > balance) {
      res.status(400).json({
        error: `Insufficient balance. Current balance: ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${asset}. Cannot debit more than the available balance.`,
      });
      return;
    }

    const txId = `TX-${nanoid(12)}`;
    const tx: Transaction = {
      id: txId,
      userId: id,
      date: new Date().toISOString(),
      type: 'Withdrawal',
      asset,
      amount,
      strategy: note || 'Loss debited by admin',
      status: 'Completed',
      txHash: `admin_${nanoid(12)}`,
    };
    await addTransaction(tx);
    // Admin debit == LOSS: append a 'loss' ledger entry (negative amount)
    // so the balance drops and the P&L on both portals reflects the loss.
    await appendLedgerEntry(id, asset, -amount, 'loss', txId);
    // Keep "Available withdrawal" in sync with losses: a debit reduces the
    // amount the client can withdraw (never below 0).
    const newAvailable = Math.max((user.availableWithdrawal ?? 0) - amount, 0);
    await setAvailableWithdrawal(id, newAvailable);
    await addAuditLog(id, 'ADMIN_DEBIT_LOSS', `Admin debited ${amount} ${asset} as LOSS (${txId}) by ${req.user!.email}. Available withdrawal reduced to ${newAvailable}.`);

    res.status(201).json({ transaction: tx, availableWithdrawal: newAvailable, message: `Debited ${amount} ${asset} from ${user.email} (recorded as loss). Available withdrawal is now ${newAvailable}.` });
  }
);

/**
 * POST /api/admin/transactions/:id/confirm-deposit
 * Confirm a client-submitted (Processing) crypto deposit and credit the account.
 * Also handles 'Reinvest' transactions: approving a reinvestment moves the
 * client's profit into their initial capital (a 'deposit' ledger entry
 * increases the cost basis; a balancing 'trade' entry removes the amount from
 * P&L so the total portfolio value is unchanged).
 * Body: { amount }
 */
router.post(
  '/transactions/:id/confirm-deposit',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const { amount } = req.body as { amount?: number };
    const txns = await getAllTransactions();
    const tx = txns.find((t) => t.id === id && (t.type === 'Deposit' || t.type === 'Reinvest'));

    if (!tx) {
      res.status(404).json({ error: 'Deposit transaction not found' });
      return;
    }
    if (tx.status === 'Completed') {
      res.status(400).json({ error: 'Deposit already confirmed' });
      return;
    }

    // ---- Validation FIRST, before anything is persisted ----
    // A reinvestment's amount IS the client's validated request: it may be
    // omitted (defaults to what was requested) but never changed, and the
    // withdrawable balance it draws from must still cover it. Validating after
    // persisting would mark a refused request 'Completed' with a bad amount and
    // permanently pollute the client's reinvested totals.
    const isReinvest = tx.type === 'Reinvest';
    const reinvestAmount = isReinvest ? Number(tx.amount) : 0;
    if (isReinvest) {
      if (amount != null && Number(amount) > 0 && Math.abs(Number(amount) - reinvestAmount) > 1e-9) {
        res.status(400).json({
          error: `This reinvestment was requested for ${reinvestAmount.toFixed(2)} USD. Approve it as-is or deny it — the amount cannot be changed here.`,
          requestedAmount: reinvestAmount,
        });
        return;
      }
    } else if (!amount || amount <= 0) {
      res.status(400).json({ error: 'A positive amount is required to confirm the deposit' });
      return;
    }

    let availableNote = '';
    if (isReinvest) {
      // Deduct from the withdrawable balance: the money is now locked into
      // investment capital, so it can no longer be withdrawn or reinvested.
      // The request was capped at this balance, so a shortfall means the balance
      // moved elsewhere in the meantime (withdrawal approved / admin changed it)
      // — report it instead of silently forgiving it and letting the books drift.
      const user = await findUserById(tx.userId);
      const currentAvailable = Number(user?.availableWithdrawal ?? 0);
      if (currentAvailable + 1e-9 < reinvestAmount) {
        res.status(409).json({
          error:
            `Cannot approve: only ${currentAvailable.toFixed(2)} USD of the client's available withdrawal is left, ` +
            `but the reinvestment needs ${reinvestAmount.toFixed(2)} USD. ` +
            `Deny the request, or reconcile the client's available withdrawal first.`,
          availableWithdrawal: currentAvailable,
          requestedAmount: reinvestAmount,
        });
        return;
      }
    }

    // A reinvestment keeps the amount the client requested; a deposit records the
    // amount the admin verified on-chain.
    const creditedAmount = isReinvest ? reinvestAmount : Number(amount);
    const updated: Transaction = {
      ...tx,
      amount: creditedAmount,
      status: 'Completed',
      strategy: tx.strategy || 'Crypto Deposit',
    };
    await addTransaction(updated);

    if (isReinvest) {
      // 1) Ledger: capital → capital. Increase the cost basis (deposit entry) and
      // remove the same amount from the P&L side (balancing trade entry). Net
      // effect on the client's total portfolio value is zero — the money just
      // changes bucket. NOTE: these two entries are also excluded from the
      // client's P&L breakdown (routes/portfolio.ts) so a reinvestment never
      // shows as a loss.
      await appendLedgerEntry(tx.userId, tx.asset, reinvestAmount, 'deposit', tx.id);
      await appendLedgerEntry(tx.userId, tx.asset, -reinvestAmount, 'trade', tx.id);

      // 2) Draw the single spendable bucket down (validated above).
      const user = await findUserById(tx.userId);
      const newAvailable = Number((Number(user?.availableWithdrawal ?? 0) - reinvestAmount).toFixed(2));
      await setAvailableWithdrawal(tx.userId, newAvailable);
      availableNote = `Available withdrawal reduced to ${newAvailable.toFixed(2)}.`;

      // 3) Update the client's active investment. The deposit grows (which
      // raises the daily accrual and can move the client up a plan tier), but
      // the TERM does not change: the plan still matures on the end_date the
      // client originally agreed to. durationDays and totalExpectedReturn are
      // recomputed from that real term so the dashboard can never promise a
      // longer term or a bigger payout than the engine will actually pay.
      const activeInv = await getActiveInvestmentForUser(tx.userId);
      let planNote = '';
      if (activeInv) {
        const newPrincipal = Number((activeInv.initialDeposit + reinvestAmount).toFixed(2));
        const override = activeInv.planOverride === true;
        const newPlan = override ? null : getPlanByAmount(newPrincipal);
        const rate = override ? (activeInv.dailyRate ?? 0) : (newPlan?.dailyRate ?? activeInv.dailyRate ?? 0);
        const planName = override ? activeInv.assignedPlan : (newPlan?.name ?? activeInv.assignedPlan);

        const term = investmentTermSummary({
          startYmd: storedDateYmd(activeInv.startDate),
          endYmd: storedDateYmd(activeInv.endDate as string),
          todayYmd: toYmd(new Date()),
          deposit: newPrincipal,
          dailyRatePercent: rate,
          alreadyCreditedProfit: activeInv.accruedProfit ?? 0,
        });

        const updatedInv: Investment = {
          ...activeInv,
          initialDeposit: newPrincipal,
          assignedPlan: planName,
          dailyRate: rate,
          // Real term of THIS investment — never the new tier's nominal duration.
          durationDays: term.termDays,
          totalExpectedReturn: term.expectedTotalReturn,
          currentValue: Number(((activeInv.currentValue ?? activeInv.initialDeposit) + reinvestAmount).toFixed(2)),
        };
        await updateInvestment(updatedInv);
        planNote =
          ` Active plan updated to ${planName} ($${newPrincipal} initial capital, ${rate}% daily). ` +
          `Maturity date unchanged (${storedDateYmd(activeInv.endDate as string)}): ` +
          `${term.remainingDays} working day(s) remain, expected total payout $${term.expectedTotalReturn.toLocaleString()}.`;
      } else if (getPlanByAmount(reinvestAmount)) {
        const newInv = await recordInvestmentForDeposit(tx.userId, reinvestAmount);
        planNote = ` Created active plan ${newInv.assignedPlan} ($${reinvestAmount} initial capital).`;
      }

      await addAuditLog(
        tx.userId,
        'REINVEST_CONFIRMED',
        `Reinvestment ${tx.id} approved: ${reinvestAmount} ${tx.asset} moved from profit to initial capital by ${req.user!.email}. ${availableNote}${planNote}`
      );
      res.json({
        transaction: updated,
        message: `Reinvestment ${tx.id} approved. ${reinvestAmount} ${tx.asset} of profit added to initial capital and deducted from available withdrawal.${planNote}`,
      });
      return;
    }

    // Atomically credit the deposit and (when the depositor was referred) pay
    // the referrer a 5% commission + referral_earnings audit row — both ledger
    // writes and the earnings row commit or roll back together in one transaction.
    const confirmation = await appendDepositAndReferralCommission(tx.userId, tx.asset, creditedAmount, tx.id);
    let commissionNote = '';
    for (const c of confirmation.commissions) {
      const referrer = await findUserById(c.earning.referrerUserId);
      commissionNote += ` Referral commission of ${c.amount} ${tx.asset} credited to ${referrer?.email ?? c.earning.referrerUserId}.`;
      await addAuditLog(
        c.earning.referrerUserId,
        'REFERRAL_COMMISSION',
        `5% referral commission of ${c.amount} ${tx.asset} earned from deposit ${tx.id} by ${tx.userId} (confirmed by ${req.user!.email})`
      );
    }

    // Snapshot the investment plan for this confirmed deposit (amounts below
    // the $20 minimum have no plan — the deposit is still credited, but no
    // investment record is created and the admin is told why).
    let investmentNote = '';
    if (tx.type === 'Deposit' && getPlanByAmount(creditedAmount)) {
      const investment = await recordInvestmentForDeposit(tx.userId, creditedAmount);
      investmentNote = ` Assigned plan: ${investment.assignedPlan}.`;
    } else if (tx.type === 'Deposit') {
      investmentNote = ` Note: below the $${MIN_DEPOSIT} minimum, so no investment plan was assigned.`;
    }

    await addAuditLog(tx.userId, 'DEPOSIT_CONFIRMED', `Deposit ${tx.id} confirmed for ${creditedAmount} ${tx.asset} by ${req.user!.email}.${investmentNote}${commissionNote}`);

    res.json({ transaction: updated, message: `Deposit ${tx.id} confirmed and credited with ${creditedAmount} ${tx.asset}.${investmentNote}${commissionNote}` });
  }
);

/**
 * POST /api/admin/transactions/:id/deny-deposit
 * Reject/cancel a client-submitted deposit (or profit reinvestment) that
 * cannot be verified. Cancelling a reinvestment releases the reserved profit.
 */
router.post(
  '/transactions/:id/deny-deposit',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    const txns = await getAllTransactions();
    const tx = txns.find((t) => t.id === id && (t.type === 'Deposit' || t.type === 'Reinvest'));

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
    await addAuditLog(tx.userId, tx.type === 'Reinvest' ? 'REINVEST_DENIED' : 'DEPOSIT_DENIED', `${tx.type === 'Reinvest' ? 'Reinvestment' : 'Deposit'} ${tx.id} denied by ${req.user!.email}`);

    res.json({ transaction: updated, message: `${tx.type === 'Reinvest' ? 'Reinvestment' : 'Deposit'} ${tx.id} denied. No funds credited.` });
  }
);

// ---------- Referrals (admin / compliance) ----------

/**
 * GET /api/admin/referrals
 * Every referral relationship platform-wide: referrer identity, referred
 * identity, signup date, and total commissions paid on that relationship.
 */
router.get(
  '/referrals',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const [users, earnings] = await Promise.all([
      getAllUsers(),
      getAllReferralEarnings(),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));

    // Commission totals per (referrer, referred) pair.
    const paidByPair = new Map<string, number>();
    for (const e of earnings) {
      const key = `${e.referrerUserId}::${e.referredUserId}`;
      paidByPair.set(key, (paidByPair.get(key) ?? 0) + e.amount);
    }

    const relationships = users
      .filter((u) => u.referredByUserId)
      .map((referred) => {
        const referrer = userMap.get(referred.referredByUserId!);
        return {
          referrer: referrer
            ? { id: referrer.id, name: referrer.name, email: referrer.email }
            : { id: referred.referredByUserId!, name: 'unknown', email: 'unknown' },
          referred: { id: referred.id, name: referred.name, email: referred.email },
          signupDate: referred.createdAt,
          totalCommissions: paidByPair.get(`${referred.referredByUserId}::${referred.id}`) ?? 0,
        };
      });

    res.json(relationships);
  }
);

/**
 * GET /api/admin/referrals/:userId/chain
 * Walks the referral graph in both directions for KYC/AML chain investigation:
 * who referred the given user, and everyone downstream they have referred
 * (recursively), with per-referral commissions paid.
 */
router.get(
  '/referrals/:userId/chain',
  requireRole(...STAFF),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = String(req.params.userId);
    const user = await findUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [users, earnings] = await Promise.all([
      getAllUsers(),
      getAllReferralEarnings(),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const earnedByReferred = new Map<string, number>();
    for (const e of earnings) {
      earnedByReferred.set(e.referredUserId, (earnedByReferred.get(e.referredUserId) ?? 0) + e.amount);
    }

    // Upstream: walk referrer links until a user with no referrer (cycle-safe).
    const referrerIds = new Set<string>();
    let cursor = user.referredByUserId ?? null;
    while (cursor && !referrerIds.has(cursor)) {
      referrerIds.add(cursor);
      cursor = userMap.get(cursor)?.referredByUserId ?? null;
    }
    const referredBy = user.referredByUserId ? userMap.get(user.referredByUserId) ?? null : null;

    // Downstream: recursive walk of everyone this user referred.
    const buildDownstream = (id: string, depth: number): { id: string; name: string; email: string; signupDate: string; totalCommissions: number; depth: number }[] => {
      if (depth > 10) return []; // hard cap to guard against pathological loops
      const direct = users.filter((u) => u.referredByUserId === id);
      return direct.flatMap((u) => [
        {
          id: u.id,
          name: u.name,
          email: u.email,
          signupDate: u.createdAt,
          totalCommissions: earnedByReferred.get(u.id) ?? 0,
          depth,
        },
        ...buildDownstream(u.id, depth + 1),
      ]);
    };

    res.json({
      user: { id: user.id, name: user.name, email: user.email },
      referredBy: referredBy
        ? { id: referredBy.id, name: referredBy.name, email: referredBy.email }
        : null,
      upstreamChain: [...referrerIds].map((id) => {
        const u = userMap.get(id)!;
        return { id, name: u?.name ?? 'unknown', email: u?.email ?? 'unknown' };
      }),
      referred: buildDownstream(userId, 1),
    });
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

/**
 * GET /api/admin/accrual/status (admin/compliance)
 * Summary of the automatic accrual job, including the cutover boundary.
 *
 * `preCutoverAccruals` must be 0: the automated engine may never own a business
 * day before ACCRUAL_START_DATE (those were credited manually).
 */
router.get(
  '/accrual/status',
  requireRole(...STAFF),
  async (_req: AuthenticatedRequest, res: Response) => {
    const cutoverDate = config.accrualStartDate;
    const summary = await getAccrualSummary(cutoverDate);
    res.json({
      ...summary,
      accrualEnabled: config.accrualEnabled,
      accrualEnabledRaw: config.accrualEnabledRaw,
      scheduler: getSchedulerStatus(cutoverDate),
    });
  }
);

/**
 * POST /api/admin/accrual/run (admin only)
 * Triggers the accrual immediately (idempotent — safe to re-run).
 *
 * Respects the cutover: it credits only business days on/after
 * ACCRUAL_START_DATE. A real (non-dry) run is refused while
 * ACCRUAL_ENABLED=false so a disabled deployment can never be credited by
 * accident; `{ "dryRun": true }` is always allowed for verification.
 */
router.post(
  '/accrual/run',
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    const dryRun = Boolean(req.body?.dryRun);
    if (!dryRun && !config.accrualEnabled) {
      res.status(409).json({
        error: `Investment accrual scheduler disabled (ACCRUAL_ENABLED=${config.accrualEnabledRaw}).`,
        hint: 'Send { "dryRun": true } to preview, or enable ACCRUAL_ENABLED=true deliberately.',
        cutoverDate: config.accrualStartDate,
      });
      return;
    }
    const result = await runInvestmentAccrual({ dryRun });
    res.json(result);
  }
);

export default router;
