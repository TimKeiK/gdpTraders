import { createHash } from 'crypto';
import { generateCode, computeReferralCommission } from '../lib/referrals.js';

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
export type EntryType = 'deposit' | 'withdrawal' | 'trade' | 'fee' | 'interest' | 'profit' | 'loss' | 'referral_commission';
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
    availableWithdrawal: number;
  /** A constant withdrawal destination address the client has saved in their profile. */
  withdrawalAddress?: string;
  /** Default network for the saved withdrawal address (e.g. TRC-20, BEP-20). */
  withdrawalNetwork?: string | null;
  /** Default coin for withdrawals (e.g. USDT, BTC, ETH). */
  withdrawalAsset?: string | null;
  /** Unique 8-char referral code for this account (generated at registration; backfilled for legacy rows). */ 
  referralCode?: string;
  /** The user who referred this account (set once at registration, then immutable). */ 
  referredByUserId?: string | null;
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

/**
 * A recorded investment: created when a client's deposit is confirmed.
 * The plan is assigned strictly from the initial deposit amount and the
 * computed fields are snapshotted at record time (immutable history).
 */
export interface Investment {
  id: string;
  userId: string; // foreign key → users.id
  initialDeposit: number;
  // Nullable on legacy rows created before the plan logic; the API layer
  // applies a runtime fallback (getPlanByAmount) until the backfill runs.
  assignedPlan: string | null; // e.g. "Silver"
  dailyRate: number | null; // e.g. 7.0 (%)
  durationDays: number | null; // working days, e.g. 100
  startDate: string; // ISO timestamp of deposit
  endDate: string | null; // start + durationDays working days (weekends skipped)
  totalExpectedReturn: number | null; // deposit * (1 + dailyRate/100 * durationDays)
  status: string; // 'active' | 'matured' | 'cancelled' | 'under_review'
  /** True when an admin manually overrode this row's plan. Auto-assigned rows
   *  omit this; the runtime amount-based fallback must not revert an override. */
  planOverride?: boolean;
  /** Running total (initial_deposit + accrued profit) shown as current value. */
  currentValue?: number;
  /** Cumulative automatically-accrued profit for this investment. */
  accruedProfit?: number;
  /** Number of business days already credited for this investment. */
  accruedDays?: number;
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
  type: 'Deposit' | 'Withdrawal' | 'Trade' | 'Fee' | 'Performance Fee' | 'Reinvest' | 'Daily Accrual';
  asset: string;
  amount: number;
  strategy: string;
  status: 'Completed' | 'Pending' | 'Processing' | 'Cancelled';
  txHash: string;
  destinationAddress?: string;
  network?: string;
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

/** A referral commission payout, kept as an audit trail in addition to the ledger entry. */
export interface ReferralEarning {

  id: string;
  referrerUserId: string;
  referredUserId: string;
  sourceTransactionId: string;
  asset: string;
  amount: number;
  createdAt: string;
}

/** Result of atomically crediting a confirmed deposit and (optionally)a referrer commission. */
export interface DepositConfirmationResult{
 
  depositEntry: LedgerEntry;
  commissions: { entry: LedgerEntry; earning: ReferralEarning; amount: number }[];
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
  investments: Map<string, Investment>;
  referralEarnings: ReferralEarning[];
  /** Per-admin notification read receipts: "<adminId>:<eventId>". */
  notificationReads: Set<string>;
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
  investments: new Map(),
  referralEarnings: [],
  notificationReads: new Set(),
};

// ---------- Investments ----------

export function addInvestment(inv: Investment): void {
  store.investments.set(inv.id, inv);
}

/** Replaces an existing investment row in place (used for admin plan overrides). */
export function updateInvestment(inv: Investment): void {
  store.investments.set(inv.id, inv);
}

/** All investments for a user, newest first. */
export function getInvestmentsForUser(userId: string): Investment[] {
  return Array.from(store.investments.values())
    .filter((i) => i.userId === userId)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
}

/** The user's most recent active investment, or undefined. */
export function getActiveInvestmentForUser(userId: string): Investment | undefined {
  return getInvestmentsForUser(userId).find((i) => i.status === 'active');
}

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

export function removeUser(id: string): void {
  store.users.delete(id);
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

export function setEmailVerified(userId: string): void {
  const user = store.users.get(userId);
  if (user) {
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
  }
}

export function setUserRole(userId: string, role: UserRole): void {
  const user = store.users.get(userId);
  if (user) user.role = role;
}

export function setAvailableWithdrawal(userId: string, amount: number): void {
  const user = store.users.get(userId);
  if (user) user.availableWithdrawal = amount;
}

export function updateUserName(userId: string, name: string): void {
  const user = store.users.get(userId);
  if (user) user.name = name;
}

export function updateUserPassword(userId: string, passwordHash: string): void {
  const user = store.users.get(userId);
  if (user) user.passwordHash = passwordHash;
}

export function setWithdrawalAddress(userId: string, address: string): void {
  const user = store.users.get(userId);
  if (user) user.withdrawalAddress = address;
}

/** Saves the client's default withdrawal coin + network (profile settings). */
export function setDefaultWithdrawalInfo(
  userId: string,
  address: string,
  network?: string,
  asset?: string
): void {
  const user = store.users.get(userId);
  if (user) {
    user.withdrawalAddress = address;
    user.withdrawalNetwork = network ?? null;
    user.withdrawalAsset = asset ?? null;
  }
}

export function getAllUsers(): User[] {
  return [...store.users.values()];
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

// ---------- Admin notification reads (per-admin read receipts) ----------

/** Which event ids an admin has already seen (as notifications). */
export function getNotificationReads(adminId: string): string[] {
  const prefix = `${adminId}:`;
  const out: string[] = [];
  for (const key of store.notificationReads) {
    if (key.startsWith(prefix)) out.push(key.slice(prefix.length));
  }
  return out;
}

/** Idempotent: marking an already-read event read again is a no-op. Returns newly-read count. */
export function markNotificationsRead(adminId: string, eventIds: string[]): number {
  let added = 0;
  for (const id of eventIds) {
    const key = `${adminId}:${String(id)}`;
    if (!store.notificationReads.has(key)) {
      store.notificationReads.add(key);
      added += 1;
    }
  }
  return added;
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

// ---------- Referrals (dual-store parity with pgStore) ----------

export function addReferralEarning(earning: ReferralEarning): void {
 store.referralEarnings.push(earning);
}

/** All commission payouts received by a referrer. */ 
export function getReferralEarningsForUser(referrerUserId: string): ReferralEarning[] {
 return store.referralEarnings.filter((e) => e.referrerUserId === referrerUserId);
}

export function getAllReferralEarnings(): ReferralEarning[] {
 return [...store.referralEarnings];
}

/** Finds a user by theirs unique, 8-char referral code. */ 
export function findUserByReferralCode(code: string): User | undefined{
 const normalized = code.trim().toUpperCase();
 return [...store.users.values()].find((u) => (u.referralCode ?? '').toUpperCase() === normalized);
}

/** User IDs this user has referred (referral relationship, platform-wide). */ 
export function getReferredUserIds(referrerId: string): string[] {
 return [...store.users.values()]
   .filter((u) => u.referredByUserId === referrerId)
   .map((u) => u.id);
}

/** Generates an 8-char referral code guaranteed unused within the store. */ 
export function generateUniqueReferralCode(): string {
 for (;;) {
   const code = generateCode();
   if (store.users.size === 0) return code;
   if ([...store.users.values()].every((u) => (u.referralCode ?? '').toUpperCase() !== code)) return code;
 }
}

/**
 * Atomically appends the confirmed-deposit ledger credit and, when the depositing
 * user was referred, a 5% commission ledger credit to the referrer plus a
 * referral_earnings audit row. In-memory mode this is synchronousand atomic
 * by construction; PostgreSQL mode wraps the same in a single DB transaction.
 */
export function appendDepositAndReferralCommission(
  userId: string,
  asset: string,
  amount: number,
  referenceId: string
): DepositConfirmationResult {
  const depositEntry = appendLedgerEntry(userId, asset, amount, 'deposit', referenceId);
  const referredBy = store.users.get(userId)?.referredByUserId;
  // Defensive: the referrer must be a real, existing user (never the depositor
  // themselves) before any commission is paid.
  const referrerExists = referredBy ? store.users.has(referredBy) : false;
  const commissions: { entry: LedgerEntry; earning: ReferralEarning; amount: number }[] = [];
  if (referredBy && referredBy !== userId && referrerExists) {
    const cAmount = computeReferralCommission(amount);
    if (cAmount > 0) {
      const entry = appendLedgerEntry(referredBy, asset, cAmount, 'referral_commission', referenceId);
      // Also credit the 5% commission directly to the referrer's available
      // withdrawal balance, so it is withdrawable immediately (not just ledger).
      const currentAvailable = store.users.get(referredBy)?.availableWithdrawal ?? 0;
      setAvailableWithdrawal(referredBy, currentAvailable + cAmount);
      const earning: ReferralEarning = {
        id: `ref_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        referrerUserId: referredBy,
        referredUserId: userId,
        sourceTransactionId: referenceId,
        asset,
        amount: cAmount,
        createdAt: new Date().toISOString(),
      };
      store.referralEarnings.push(earning);
      commissions.push({ entry , earning , amount: cAmount });
    }
  }
  return { depositEntry , commissions };
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