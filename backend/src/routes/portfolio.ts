import { Router, type Request, type Response } from 'express';
import {
  getAllocations,
  getPerformance,
  getTransactionsForUser,
  getLedgerForUser,
} from '../db/index.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/portfolio/summary
 * Aggregated portfolio value and P&L.
 * P&L = Profit/Loss from trading activity (trades, fees, interest)
 * Excludes initial deposits (cost basis is tracked separately).
 */
router.get('/summary', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const ledger = await getLedgerForUser(userId);

  // Portfolio value is derived from the immutable ledger so that every
  // completed deposit/withdrawal/trade is reflected automatically.
  // - Deposits are positive amounts, withdrawals are negative amounts.
  // - Net position = deposits + withdrawals (cost basis minus outflows).
  // - Trading P&L = trades, fees, interest entries.
  const netDeposited = ledger
    .filter(entry => entry.entryType === 'deposit' || entry.entryType === 'withdrawal')
    .reduce((sum, entry) => sum + entry.amount, 0);

  const tradingPnl = ledger
    .filter(entry => !['deposit', 'withdrawal'].includes(entry.entryType))
    .reduce((sum, entry) => sum + entry.amount, 0);

  const totalValue = netDeposited + tradingPnl;

  // 24h P&L from strategy allocations (from live market data)
  const allocations = await getAllocations(userId);
  const totalPnl24h = allocations.reduce((sum, a) => sum + a.pnl24h, 0);

  // Cost basis = total amount deposited (excludes trading gains/losses)
  const costBasis = ledger
    .filter(entry => entry.entryType === 'deposit')
    .reduce((sum, entry) => sum + entry.amount, 0);

  // Total P&L = sum of all trading activity (trades, fees, interest).
  // Excludes deposits and withdrawals.
  const totalPnl = tradingPnl;

  const totalPnlPercent = costBasis !== 0 ? (totalPnl / costBasis) * 100 : 0;
  const todayPnlPercent = costBasis !== 0 ? (totalPnl24h / costBasis) * 100 : 0;

  res.json({
    totalValue,
    totalPnl, // Actual trading profit/loss (excludes deposits)
    totalPnlPercent,
    todayPnl: totalPnl24h,
    todayPnlPercent,
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