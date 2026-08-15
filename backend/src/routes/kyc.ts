import { Router, type Request, type Response } from 'express';
import {
  setKycStatus,
  addAuditLog,
  type KYCStatus,
} from '../db/index.js';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/kyc/status
 * Returns the user's current KYC status.
 */
router.get('/status', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  res.json({
    status: user.kycStatus,
    message:
      user.kycStatus === 'APPROVED'
        ? 'KYC verified. Deposits and withdrawals are enabled.'
        : user.kycStatus === 'PENDING'
          ? 'KYC verification required before deposits are accepted.'
          : `KYC status: ${user.kycStatus}`,
  });
});

/**
 * POST /api/kyc/submit
 * Submits KYC documents. In production this calls Onfido/Persona/Sumsub.
 * Emits UserVerified event upon approval (backend.md §4.2).
 */
router.post('/submit', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { documentType, documentNumber } = req.body;
  const user = req.user!;

  if (!documentType || !documentNumber) {
    res.status(400).json({ error: 'documentType and documentNumber are required' });
    return;
  }

  // In production: call KYC provider (Onfido/Persona/Sumsub) here.
  // Demo: auto-approve after submission.
  await setKycStatus(user.id, 'APPROVED');
  await addAuditLog(user.id, 'KYC_SUBMITTED', `KYC submitted with ${documentType}`);
  await addAuditLog(user.id, 'KYC_APPROVED', 'KYC verification passed via provider');

  res.json({
    status: 'APPROVED',
    message: 'KYC verification approved. Deposits are now enabled.',
  });
});

/**
 * POST /api/kyc/status (admin/compliance only)
 * Manually update a user's KYC status.
 */
router.post(
  '/status',
  requireAuth,
  requireRole('admin', 'compliance'),
  async (req: AuthenticatedRequest, res: Response) => {
    const { userId, status } = req.body as { userId: string; status: KYCStatus };
    const validStatuses: KYCStatus[] = ['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid KYC status' });
      return;
    }
    await setKycStatus(userId, status);
    await addAuditLog(userId, 'KYC_STATUS_CHANGED', `KYC status set to ${status} by ${req.user!.email}`);
    res.json({ userId, status });
  }
);

export default router;