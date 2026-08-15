import { Router, type Request, type Response } from 'express';
import { STRATEGIES } from '../data/strategies.js';

const router = Router();

/**
 * GET /api/strategies
 * Public investment product definitions (backend.md §2.1).
 * No hard APY promises - strategies described by mechanism only.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json(STRATEGIES);
});

/**
 * GET /api/strategies/:id
 * Returns a single strategy by ID.
 */
router.get('/:id', (req: Request, res: Response) => {
  const strategy = STRATEGIES.find((s) => s.id === req.params.id);
  if (!strategy) {
    res.status(404).json({ error: 'Strategy not found' });
    return;
  }
  res.json(strategy);
});

export default router;