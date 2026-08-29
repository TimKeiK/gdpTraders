import { Router, type Request, type Response } from 'express';
import {
  getAllocations,
  getPerformance,
  getTransactionsForUser,
  getLedgerForUser,
  findUserById,
} from '../db/index.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/portfolio/summary
 * Aggregated portfolio value and P&L.
 * P&L = Profit/Loss from trading activity AND admin-managed profit/loss
 * entries (admin credit == profit, admin debit == loss).
 * Excludes initial deposits (cost basis is tracked separately).
 */
router.get('/summary', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const ledger = await getLedgerForUser(userId);

  // Portfolio value is derived from the immutable ledger so that every
  // completed deposit/withdrawal/trade is reflected automatically.
  // - Deposits are positive amounts, withdrawals are negative amounts.
  // - Net position = deposits + withdrawals (cost basis minus outflows).
  // - Trading P&L = trades, fees, interest + admin-managed profit/loss entries.
  const netDeposited = ledger
    .filter(entry => entry.entryType === 'deposit' || entry.entryType === 'withdrawal')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const pnlEntries = ledger.filter(entry => !['deposit', 'withdrawal'].includes(entry.entryType));
  const tradingPnl = pnlEntries.reduce((sum, entry) => sum + entry.amount, 0);

  const totalValue = netDeposited + tradingPnl;

  // 24h P&L from strategy allocations (from live market data)
  const allocations = await getAllocations(userId);
  const totalPnl24h = allocations.reduce((sum, a) => sum + a.pnl24h, 0);

  // Cost basis = total amount deposited (excludes trading gains/losses)
  const costBasis = ledger
    .filter(entry => entry.entryType === 'deposit')
    .reduce((sum, entry) => sum + entry.amount, 0);

  // Total P&L = sum of all trading activity + admin-managed profit/loss.
  // Excludes deposits and withdrawals.
  const totalPnl = tradingPnl;

  // Admin-managed Profit & Loss breakdown:
  // - every admin CREDIT is a 'profit' ledger entry (positive amount)
  // - every admin DEBIT is a 'loss' ledger entry (negative amount)
  const totalProfit = pnlEntries.reduce((sum, entry) => sum + Math.max(entry.amount, 0), 0);
  const totalLoss = pnlEntries.reduce((sum, entry) => sum + Math.abs(Math.min(entry.amount, 0)), 0);

  const user = await findUserById(userId);

  const totalPnlPercent = costBasis !== 0 ? (totalPnl / costBasis) * 100 : 0;
  const todayPnlPercent = costBasis !== 0 ? (totalPnl24h / costBasis) * 100 : 0;

  res.json({
    totalValue,
    totalPnl, // Actual profit/loss (admin-managed credits/debits + trading activity; excludes deposits)
    totalProfit,
    totalLoss,
    netPnl: totalProfit - totalLoss,
    // Initial capital = total deposits made by the client (cost basis).
    initialDeposit: costBasis,
    // Admin-set withdrawable amount (from the initial deposit + profit).
    availableWithdrawal: user?.availableWithdrawal ?? 0,
    totalPnlPercent,
    todayPnl: totalPnl24h,
    todayPnlPercent,
    lastUpdated: new Date().toISOString(),
  });
});

/**
 * GET /api/portfolio/pnl
 * Client-facing Profit & Loss statement driven by admin-managed credits/debits:
 * - Admin credit (profit) and admin debit (loss) ledger entries with the
 *   full breakdown plus the recent P&L activity list.
 */
router.get('/pnl', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const ledger = await getLedgerForUser(userId);

  const pnlEntries = ledger.filter(entry => entry.entryType === 'profit' || entry.entryType === 'loss');

  const totalProfit = pnlEntries
    .filter(entry => entry.entryType === 'profit')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalLoss = pnlEntries
    .filter(entry => entry.entryType === 'loss')
    .reduce((sum, entry) => sum + Math.abs(entry.amount), 0);

  // Cost basis for the percentage — total deposits (client's own funds)
  const costBasis = ledger
    .filter(entry => entry.entryType === 'deposit')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const netPnl = totalProfit - totalLoss;

  res.json({
    totalProfit,
    totalLoss,
    netPnl,
    netPnlPercent: costBasis !== 0 ? (netPnl / costBasis) * 100 : 0,
    entries: pnlEntries
      .slice()
      .reverse()
      .map((e) => ({
        id: e.id,
        date: e.createdAt,
        kind: e.entryType === 'profit' ? 'Profit' : 'Loss',
        asset: e.asset,
        amount: e.amount,
        referenceId: e.referenceId,
      })),
    lastUpdated: new Date().toISOString(),
  });
});

/**
 * GET /api/portfolio/allocations
 * Strategy allocations with 24h P&L.
 */
router.get('/allocations', async (req: AuthenticatedRequest, res: Response) => {
  const allocations = await getAllocations(req.userId!);
  res.json(allocations);
});

/**
 * GET /api/portfolio/performance?days=90
 * Portfolio vs benchmark performance series.
 */
router.get('/performance', async (req: AuthenticatedRequest, res: Response) => {
  const days = Math.min(parseInt(req.query.days as string, 10) || 90, 365);
  const series = await getPerformance(req.userId!);
  res.json(series.slice(-days));
});

/**
 * GET /api/portfolio/transactions
 * User's transaction history.
 */
router.get('/transactions', async (req: AuthenticatedRequest, res: Response) => {
  const transactions = await getTransactionsForUser(req.userId!);
  res.json(transactions);
});

/**
 * GET /api/portfolio/ledger
 * Immutable ledger entries for the user (append-only financial records).
 */
router.get('/ledger', async (req: AuthenticatedRequest, res: Response) => {
  const ledger = await getLedgerForUser(req.userId!);
  res.json(ledger);
});

export default router;