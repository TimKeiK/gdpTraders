import { Router, type Request, type Response } from 'express';
import {
  getAllUsers,
  getLedgerForUser,
  getReferralEarningsForUser,
  type User,
  type ReferralEarning,
} from '../db/index.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { buildReferralLink, maskEmail, maskName } from '../lib/referrals.js';

const router = Router();

/**
 * GET /api/referrals/me
 * The caller's referral code, shareable signup link, total commissions earned,
 * and everyone they have referred (name/email masked for privacy, with signup
 * date, KYC status, lifetime deposits, and per-referral earnings).
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const me = req.user!;

  const [users, earnings] = await Promise.all([
    getAllUsers(),
    getReferralEarningsForUser(me.id),
  ]);

  // Total earned across all assets (commissions credited to this referrer).
  const totalEarned = earnings.reduce((s, e) => s + e.amount, 0);

  // Per-referred-user commission totals.
  const earnedByReferred = new Map<string, number>();
  for (const e of earnings as ReferralEarning[]) {
    earnedByReferred.set(e.referredUserId, (earnedByReferred.get(e.referredUserId) ?? 0) + e.amount);
  }

  const referredUsers = users.filter((u) => u.referredByUserId === me.id);
  const referredClients = await Promise.all(
    referredUsers.map(async (u) => {
      // Lifetime deposits = sum of the referred user's 'deposit' ledger entries.
      const ledger = await getLedgerForUser(u.id);
      const totalDeposits = ledger
        .filter((e) => e.entryType === 'deposit')
        .reduce((s, e) => s + e.amount, 0);
      return {
        id: u.id,
        name: maskName(u.name),
        email: maskEmail(u.email),
        signupDate: u.createdAt,
        kycStatus: u.kycStatus,
        totalDeposits,
        totalEarned: earnedByReferred.get(u.id) ?? 0,
      };
    })
  );

  res.json({
    referralCode: me.referralCode ?? null,
    referralLink: me.referralCode ? buildReferralLink(config.frontendUrl, me.referralCode) : null,
    totalEarned,
    referredClients,
  });
});

export default router;