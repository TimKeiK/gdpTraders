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
} from './database.js';

// Re-export all functions from the active store
export const {
  appendLedgerEntry,
  verifyLedgerIntegrity,
  addUser,
  findUserByEmail,
  findUserById,
  setKycStatus,
<<<<<<< HEAD
  setEmailVerified,        // added
=======
  setUserRole,
  getAllUsers,
>>>>>>> 198d249b3b891883c4f3f576bb65bb415acd0581
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
  addWithdrawalRequest,
  getWithdrawalRequests,
  updateWithdrawalRequest,
  getLedgerForUser,
  getAllLedger,
  getDbStats,
} = store;

export const dbMode = useInMemory ? 'in-memory' : 'postgresql';

/**
 * Runs idempotent schema migrations (PostgreSQL mode only).
 * Safe to call at every startup; no-ops in in-memory mode.
 */
export async function ensureSchema(): Promise<void> {
  if (!useInMemory) {
    await pgStore.ensureSchema();
  }
}