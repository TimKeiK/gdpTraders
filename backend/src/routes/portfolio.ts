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
 */
router.get('/summary', async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId!;
  const allocations = await getAllocations(userId);

  const totalValue = allocations.reduce((sum, a) => sum + a.allocation, 0);
  const totalPnl24h = allocations.reduce((sum, a) => sum + a.pnl24h, 0);
  const costBasis = 880000; // Demo cost basis
  const todayPnlDenominator = totalValue - totalPnl24h;
  const todayPnlPercent = todayPnlDenominator !== 0
    ? (totalPnl24h / todayPnlDenominator) * 100
    : 0;

  res.json({
    totalValue,
    totalPnl: totalValue - costBasis,
    totalPnlPercent: ((totalValue - costBasis) / costBasis) * 100,
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