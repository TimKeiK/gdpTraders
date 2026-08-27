import { createHash } from 'crypto';

/**
 * In-memory database implementing the core financial safety rules from backend.md:
 * - Append-only ledger (never update a balance in place)
 * - Integrity-hash chaining to prevent tampering
 * - KYC gating: no deposits accepted until KYC status is APPROVED
 *
 * In production this is replaced by PostgreSQL (see .env: DATABASE_URL).
 */

// ---------- Types ----------

export type KYCStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
export type WalletType = 'hot' | 'warm' | 'cold';
export type EntryType = 'deposit' | 'withdrawal' | 'trade' | 'fee' | 'interest' | 'profit' | 'loss';
export type UserRole = 'client' | 'admin' | 'compliance';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  kycStatus: KYCStatus;
  ipWhitelist: string[];
  withdrawalCap: number; // daily USD cap
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  createdAt: string;
}

export interface Wallet {
  id: string;
  userId: string;
  asset: string;
  address: string;
  walletType: WalletType;
  createdAt: string;
}

export interface DepositAddress {
  address: string;
  userId: string;
  asset: string;
  isActive: boolean;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  userId: string;
  asset: string;
  amount: number;
  entryType: EntryType;
  referenceId: string;
  createdAt: string;
  integrityHash: string;
}

export interface Transaction {
  id: string;
  userId: string;
  date: string;
  type: 'Deposit' | 'Withdrawal' | 'Trade' | 'Fee' | 'Performance Fee';
  asset: string;
  amount: number;
  strategy: string;
  status: 'Completed' | 'Pending' | 'Processing' | 'Cancelled';
  txHash: string;
  destinationAddress?: string;
  requiresApproval?: boolean;
  approval1?: boolean;
  approval2?: boolean;
}

export interface StrategyAllocation {
  strategyId: string;
  strategyName: string;
  allocation: number;
  weight: number;
  pnl24h: number;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  details: string;
  createdAt: string;
}

// ---------- In-memory store ----------

type Store = {
  users: Map<string, User>;
  wallets: Map<string, Wallet>;
  depositAddresses: Map<string, DepositAddress>;
  ledger: LedgerEntry[];
  transactions: Map<string, Transaction>;
  allocations: Map<string, StrategyAllocation[]>;
  performance: Map<string, { date: string; portfolio: number; benchmark: number }[]>;
  auditLogs: AuditLogEntry[];
  withdrawalRequests: Map<string, Transaction>;
};

const store: Store = {
  users: new Map(),
  wallets: new Map(),
  depositAddresses: new Map(),
  ledger: [],
  transactions: new Map(),
  allocations: new Map(),
  performance: new Map(),
  auditLogs: [],
  withdrawalRequests: new Map(),
};

// ---------- Ledger integrity ----------

/**
 * Append-only ledger with a cryptographic hash chain.
 * Each entry's hash = SHA256(previous_hash + entry JSON).
 * This prevents tampering: any modification to an earlier row
 * invalidates all subsequent hashes.
 */
export function appendLedgerEntry(
  userId: string,
  asset: string,
  amount: number,
  entryType: EntryType,
  referenceId: string
): LedgerEntry {
  const previous = store.ledger[store.ledger.length - 1];
  const previousHash = previous?.integrityHash ?? 'GENESIS';

  const entry: Omit<LedgerEntry, 'integrityHash'> = {
    id: `led_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    userId,
    asset,
    amount,
    entryType,
    referenceId,
    createdAt: new Date().toISOString(),
  };

  const integrityHash = createHash('sha256')
    .update(previousHash + JSON.stringify(entry))
    .digest('hex');

  const full: LedgerEntry = { ...entry, integrityHash };
  store.ledger.push(full);
  return full;
}

export function verifyLedgerIntegrity(): { valid: boolean; checked: number } {
  let prevHash = 'GENESIS';
  for (const entry of store.ledger) {
    const { integrityHash, ...data } = entry;
    const computed = createHash('sha256')
      .update(prevHash + JSON.stringify(data))
      .digest('hex');
    if (computed !== integrityHash) return { valid: false, checked: store.ledger.length };
    prevHash = integrityHash;
  }
  return { valid: true, checked: store.ledger.length };
}

// ---------- CRUD helpers ----------

export function addUser(user: User): void {
  store.users.set(user.id, user);
}

export function findUserByEmail(email: string): User | undefined {
  return [...store.users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(id: string): User | undefined {
  return store.users.get(id);
}

export function setKycStatus(userId: string, status: KYCStatus): void {
  const user = store.users.get(userId);
  if (user) user.kycStatus = status;
}

<<<<<<< HEAD
export function setEmailVerified(userId: string): void {
  const user = store.users.get(userId);
  if (user) {
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
  }
=======
export function setUserRole(userId: string, role: UserRole): void {
  const user = store.users.get(userId);
  if (user) user.role = role;
}

export function getAllUsers(): User[] {
  return [...store.users.values()];
>>>>>>> 198d249b3b891883c4f3f576bb65bb415acd0581
}

export function addWallet(wallet: Wallet): void {
  store.wallets.set(wallet.id, wallet);
}

export function getWalletsForUser(userId: string): Wallet[] {
  return [...store.wallets.values()].filter((w) => w.userId === userId);
}

export function addDepositAddress(addr: DepositAddress): void {
  store.depositAddresses.set(addr.address, addr);
}

export function getDepositAddress(userId: string, asset: string): DepositAddress | undefined {
  return [...store.depositAddresses.values()].find(
    (a) => a.userId === userId && a.asset === asset && a.isActive
  );
}

export function addTransaction(tx: Transaction): void {
  store.transactions.set(tx.id, tx);
}

export function getTransactionsForUser(userId: string): Transaction[] {
  return [...store.transactions.values()]
    .filter((t) => t.userId === userId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getAllTransactions(): Transaction[] {
  return [...store.transactions.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function addAllocations(userId: string, allocations: StrategyAllocation[]): void {
  store.allocations.set(userId, allocations);
}

export function getAllocations(userId: string): StrategyAllocation[] {
  return store.allocations.get(userId) ?? [];
}

export function addPerformance(userId: string, series: { date: string; portfolio: number; benchmark: number }[]): void {
  store.performance.set(userId, series);
}

export function getPerformance(userId: string): { date: string; portfolio: number; benchmark: number }[] {
  return store.performance.get(userId) ?? [];
}

export function addAuditLog(userId: string, action: string, details: string): void {
  store.auditLogs.push({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    userId,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
}

export function getAuditLogs(): AuditLogEntry[] {
  return [...store.auditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addWithdrawalRequest(tx: Transaction): void {
  store.withdrawalRequests.set(tx.id, tx);
}

export function getWithdrawalRequests(): Transaction[] {
  return [...store.withdrawalRequests.values()];
}

export function updateWithdrawalRequest(id: string, patch: Partial<Transaction>): Transaction | undefined {
  const tx = store.withdrawalRequests.get(id);
  if (tx) {
    Object.assign(tx, patch);
    store.transactions.set(id, tx);
  }
  return tx;
}

export function getLedgerForUser(userId: string): LedgerEntry[] {
  return store.ledger.filter((e) => e.userId === userId);
}

export function getAllLedger(): LedgerEntry[] {
  return [...store.ledger];
}

export function getDbStats() {
  return {
    users: store.users.size,
    wallets: store.wallets.size,
    depositAddresses: store.depositAddresses.size,
    ledgerEntries: store.ledger.length,
    transactions: store.transactions.size,
    auditLogs: store.auditLogs.length,
  };
}