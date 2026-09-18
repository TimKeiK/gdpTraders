/**
 * Unified database store.
 *
 * Switches between in-memory (dev) and PostgreSQL (Docker/production)
 * based on the USE_IN_MEMORY_DB environment variable.
 *
 * Both implementations expose the same interface.
 */

import * as memoryStore from './database.js';
import * as pgStore from './pgStore.js';

const useInMemory = process.env.USE_IN_MEMORY_DB === 'true';

export const store = useInMemory ? memoryStore : pgStore;

// Re-export types
export type {
  KYCStatus,
  WalletType,
  EntryType,
  UserRole,
  User,
  Wallet,
  DepositAddress,
  LedgerEntry,
  Transaction,
  StrategyAllocation,
  AuditLogEntry,
  Investment,
  ReferralEarning,
  DepositConfirmationResult,
} from './database.js';

// Re-export all functions from the active store
export const {
  appendLedgerEntry,
  verifyLedgerIntegrity,
  addUser,
  removeUser,
  findUserByEmail,
  findUserById,
  setKycStatus,
  setEmailVerified,
  setUserRole,
  setAvailableWithdrawal,
  updateUserName,
  updateUserPassword,
    setWithdrawalAddress,
  setDefaultWithdrawalInfo,
  getAllUsers,
  addWallet,
  getWalletsForUser,
  addDepositAddress,
  getDepositAddress,
  addTransaction,
  getTransactionsForUser,
  getAllTransactions,
  addAllocations,
  getAllocations,
  addPerformance,
  getPerformance,
  addAuditLog,
  getAuditLogs,
  getNotificationReads,
  markNotificationsRead,
  addWithdrawalRequest,
  getWithdrawalRequests,
  updateWithdrawalRequest,
  getLedgerForUser,
  getAllLedger,
  addInvestment,
  updateInvestment,
  getInvestmentsForUser,
  getActiveInvestmentForUser,
  getDbStats,
  // Referral program (dual-store parity)
  findUserByReferralCode,
  getReferredUserIds,
  generateUniqueReferralCode,
  addReferralEarning,
  getReferralEarningsForUser,
  getAllReferralEarnings,
  appendDepositAndReferralCommission,
} = store;

export const dbMode = useInMemory ? 'in-memory' : 'postgresql';

// Accrual is a PostgreSQL-only feature. Re-exported directly (not through the
// in-memory store union) because the scheduler runs only in postgres mode.
export {
  getAllActiveInvestments,
  getProcessedAccrualDates,
  creditDailyAccrual,
  getAccrualSummary,
} from './pgStore.js';
export type { CreditAccrualInput, CreditAccrualResult } from './pgStore.js';

/**
 * Runs idempotent schema migrations (PostgreSQL mode only).
 * Safe to call at every startup; no-ops in in-memory mode.
 *
 * @param cutoverYmd Accrual cutover date (ACCRUAL_START_DATE) — used only to
 *   mark manual-era investments that matured before the cutover as 'matured'.
 *   Never credits a balance and never rewrites pre-cutover accrual history.
 */
export async function ensureSchema(cutoverYmd?: string): Promise<void> {
  if (!useInMemory) {
    await pgStore.ensureSchema(cutoverYmd);
  }
}