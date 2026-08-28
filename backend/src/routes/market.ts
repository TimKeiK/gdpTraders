// backend/src/routes/market.ts
import { Router, type Request, type Response } from 'express';
import {
  COINS,
  fetchMarketSummary,
  fetchOHLC,
  getCoin,
  isSupportedCoin,
  resolveDays,
} from '../lib/market.js';

const router = Router();

/** GET /api/market/coins — supported coin list for the selector UI. */
router.get('/coins', (_req: Request, res: Response) => {
  res.json({ coins: COINS });
});

/** GET /api/market/summary?coin=bitcoin */
router.get('/summary', async (req: Request, res: Response) => {
  const coinId = String(req.query.coin || 'bitcoin');
  if (!isSupportedCoin(coinId)) {
    res.status(400).json({ error: `Unsupported coin: ${coinId}` });
    return;
  }
  try {
    res.json(await fetchMarketSummary(coinId));
  } catch (err) {
    console.error('[market] summary failed:', err);
    res.status(502).json({ error: 'Market data unavailable. Please retry shortly.' });
  }
});

/** GET /api/market/ohlc?coin=bitcoin&range=24h|7d|30d */
router.get('/ohlc', async (req: Request, res: Response) => {
  const coinId = String(req.query.coin || 'bitcoin');
  if (!isSupportedCoin(coinId)) {
    res.status(400).json({ error: `Unsupported coin: ${coinId}` });
    return;
  }
  const days = resolveDays(String(req.query.range || '7d'));
  try {
    const candles = await fetchOHLC(coinId, days);
    res.json({ coinId, symbol: getCoin(coinId).symbol, range: days, candles });
  } catch (err) {
    console.error('[market] ohlc failed:', err);
    res.status(502).json({ error: 'Market data unavailable. Please retry shortly.' });
  }
});

export default router;
