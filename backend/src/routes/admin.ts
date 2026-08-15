import { Router, type Request, type Response } from 'express';
import {
  getAuditLogs,
  getAllLedger,
  getDbStats,
  verifyLedgerIntegrity,
  addAuditLog,
} from '../db/index.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/admin/audit-logs (admin/compliance)
 * Immutable admin audit trail (backend.md §4.6).
 */
router.get(
  '/audit-logs',
  requireRole('admin', 'compliance'),
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getAuditLogs());
  }
);

/**
 * GET /api/admin/ledger (admin/compliance)
 * Full append-only ledger.
 */
router.get(
  '/ledger',
  requireRole('admin', 'compliance'),
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
  requireRole('admin', 'compliance'),
  async (req: AuthenticatedRequest, res: Response) => {
    const result = await verifyLedgerIntegrity();
    await addAuditLog(req.userId!, 'LEDGER_VERIFY', `Integrity check: ${result.valid ? 'OK' : 'TAMPERED'} (${result.checked} entries)`);
    res.json(result);
  }
);

/**
 * GET /api/admin/stats (admin/compliance)
 * System-wide statistics.
 */
router.get(
  '/stats',
  requireRole('admin', 'compliance'),
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getDbStats());
  }
);

export default router;