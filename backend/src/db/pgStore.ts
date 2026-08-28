import { createHash } from 'crypto';
import pg from 'pg';

const { Pool } = pg;

/**
 * PostgreSQL-backed store implementing the same interface as the in-memory
 * database (database.ts). Used when running in Docker with PostgreSQL.
 *
 * Implements the core financial safety rules from backend.md:
 * - Append-only ledger with integrity hash chaining
 * - KYC gating: no deposits until APPROVED
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://gdptrader:password@localhost:5432/gdptraders',
});

/**
 * Idempotent schema migrations that run at every startup.
 *
 * schema.sql is only executed by Postgres when its data volume is FIRST
 * initialized. For any database created before newer columns were added
 * (e.g. transactions.destination_address), these ALTERs self-heal the
 * drift so inserts/queries never fail with "column does not exist".
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS destination_address VARCHAR(255)`
  );

  // Email-verification columns (added in the "email verification" change).
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255)`
  );

  // Data-correctness normalization: a Withdrawal is only truly "Completed"
  // once its ledger deduction exists. Any withdrawal stuck at 'Processing'
  // whose funds were already deducted (ledger entry present) must read
  // 'Completed' so the client-facing status matches the portfolio math.
  await pool.query(
    `UPDATE transactions t
     SET status = 'Completed'
     WHERE t.type = 'Withdrawal'
       AND t.status = 'Processing'
       AND EXISTS (
         SELECT 1 FROM ledger_entries l
         WHERE l.reference_id = t.id AND l.entry_type = 'withdrawal'
       )`
  );
}

// ---------- Types (re-exported from database.ts) ----------
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
  withdrawalCap: number;
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

// ---------- Ledger integrity ----------

export async function appendLedgerEntry(
  userId: string,
  asset: string,
  amount: number,
  entryType: EntryType,
  referenceId: string
): Promise<LedgerEntry> {
  const client = await pool.connect();
  try {
    const lastRes = await client.query(
      'SELECT integrity_hash FROM ledger_entries ORDER BY id DESC LIMIT 1'
    );
    const previousHash = lastRes.rows[0]?.integrity_hash ?? 'GENESIS';

    const entry = {
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

    const res = await client.query(
      `INSERT INTO ledger_entries (user_id, asset, amount, entry_type, reference_id, integrity_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, user_id, asset, amount, entry_type, reference_id, created_at, integrity_hash`,
      [userId, asset, amount, entryType, referenceId, integrityHash]
    );

    const row = res.rows[0];
    return {
      id: String(row.id),
      userId: row.user_id,
      asset: row.asset,
      amount: Number(row.amount),
      entryType: row.entry_type,
      referenceId: row.reference_id,
      createdAt: row.created_at,
      integrityHash: row.integrity_hash,
    };
  } finally {
    client.release();
  }
}

export async function verifyLedgerIntegrity(): Promise<{ valid: boolean; checked: number }> {
  const res = await pool.query(
    'SELECT id, user_id, asset, amount, entry_type, reference_id, created_at, integrity_hash FROM ledger_entries ORDER BY id'
  );
  let prevHash = 'GENESIS';
  for (const row of res.rows) {
    const data = {
      userId: row.user_id,
      asset: row.asset,
      amount: Number(row.amount),
      entryType: row.entry_type,
      referenceId: row.reference_id,
      createdAt: row.created_at,
    };
    const computed = createHash('sha256')
      .update(prevHash + JSON.stringify(data))
      .digest('hex');
    if (computed !== row.integrity_hash) return { valid: false, checked: res.rows.length };
    prevHash = row.integrity_hash;
  }
  return { valid: true, checked: res.rows.length };
}

// ---------- Users ----------

export async function addUser(user: User): Promise<void> {
  await pool.query(
    `INSERT INTO users (id, email, password_hash, name, role, kyc_status, ip_whitelist, withdrawal_cap, is_email_verified, email_verification_token, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO NOTHING`,
    [user.id, user.email, user.passwordHash, user.name, user.role, user.kycStatus,
     user.ipWhitelist, user.withdrawalCap, user.isEmailVerified, user.emailVerificationToken, user.createdAt]
  );
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (res.rows.length === 0) return undefined;
  return mapUser(res.rows[0]);
}

export async function findUserById(id: string): Promise<User | undefined> {
  const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (res.rows.length === 0) return undefined;
  return mapUser(res.rows[0]);
}

export async function setKycStatus(userId: string, status: KYCStatus): Promise<void> {
  await pool.query('UPDATE users SET kyc_status = $1 WHERE id = $2', [status, userId]);
}

export async function setEmailVerified(userId: string): Promise<void> {
  await pool.query(
    'UPDATE users SET is_email_verified = true, email_verification_token = NULL WHERE id = $1',
    [userId]
  );
}

export async function setUserRole(userId: string, role: UserRole): Promise<void> {
  await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
}

export async function getAllUsers(): Promise<User[]> {
  const res = await pool.query('SELECT * FROM users');
  return res.rows.map(mapUser);
}

function mapUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role,
    kycStatus: row.kyc_status,
    ipWhitelist: row.ip_whitelist || [],
    withdrawalCap: Number(row.withdrawal_cap),
    isEmailVerified: row.is_email_verified,
    emailVerificationToken: row.email_verification_token,
    createdAt: row.created_at,
  };
}

// ---------- Wallets ----------

export async function addWallet(wallet: Wallet): Promise<void> {
  await pool.query(
    `INSERT INTO wallets (id, user_id, asset, address, wallet_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
    [wallet.id, wallet.userId, wallet.asset, wallet.address, wallet.walletType, wallet.createdAt]
  );
}

export async function getWalletsForUser(userId: string): Promise<Wallet[]> {
  const res = await pool.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
  return res.rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    asset: r.asset,
    address: r.address,
    walletType: r.wallet_type,
    createdAt: r.created_at,
  }));
}

// ---------- Deposit addresses ----------

export async function addDepositAddress(addr: DepositAddress): Promise<void> {
  await pool.query(
    `INSERT INTO deposit_addresses (address, user_id, asset, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (address) DO NOTHING`,
    [addr.address, addr.userId, addr.asset, addr.isActive, addr.createdAt]
  );
}

export async function getDepositAddress(userId: string, asset: string): Promise<DepositAddress | undefined> {
  const res = await pool.query(
    'SELECT * FROM deposit_addresses WHERE user_id = $1 AND asset = $2 AND is_active = true',
    [userId, asset]
  );
  if (res.rows.length === 0) return undefined;
  const r = res.rows[0];
  return { address: r.address, userId: r.user_id, asset: r.asset, isActive: r.is_active, createdAt: r.created_at };
}

// ---------- Transactions ----------

export async function addTransaction(tx: Transaction): Promise<void> {
  await pool.query(
    `INSERT INTO transactions (id, user_id, date, type, asset, amount, strategy, status, tx_hash, destination_address, requires_approval, approval1, approval2)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       date = EXCLUDED.date,
       type = EXCLUDED.type,
       asset = EXCLUDED.asset,
       amount = EXCLUDED.amount,
       strategy = EXCLUDED.strategy,
       status = EXCLUDED.status,
       tx_hash = EXCLUDED.tx_hash,
       destination_address = EXCLUDED.destination_address,
       requires_approval = EXCLUDED.requires_approval,
       approval1 = EXCLUDED.approval1,
       approval2 = EXCLUDED.approval2`,
    [tx.id, tx.userId, tx.date, tx.type, tx.asset, tx.amount, tx.strategy, tx.status,
     tx.txHash, tx.destinationAddress ?? null, tx.requiresApproval ?? false, tx.approval1 ?? false, tx.approval2 ?? false]
  );
}

export async function getTransactionsForUser(userId: string): Promise<Transaction[]> {
  const res = await pool.query(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC',
    [userId]
  );
  return res.rows.map(mapTransaction);
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const res = await pool.query('SELECT * FROM transactions ORDER BY date DESC');
  return res.rows.map(mapTransaction);
}

function mapTransaction(r: any): Transaction {
  return {
    id: r.id,
    userId: r.user_id,
    date: r.date,
    type: r.type,
    asset: r.asset,
    amount: Number(r.amount),
    strategy: r.strategy,
    status: r.status,
    txHash: r.tx_hash,
    destinationAddress: r.destination_address ?? undefined,
    requiresApproval: r.requires_approval,
    approval1: r.approval1,
    approval2: r.approval2,
  };
}

// ---------- Allocations ----------

export async function addAllocations(userId: string, allocations: StrategyAllocation[]): Promise<void> {
  for (const a of allocations) {
    await pool.query(
      `INSERT INTO strategy_allocations (user_id, strategy_id, strategy_name, allocation, weight, pnl_24h)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, a.strategyId, a.strategyName, a.allocation, a.weight, a.pnl24h]
    );
  }
}

export async function getAllocations(userId: string): Promise<StrategyAllocation[]> {
  const res = await pool.query(
    'SELECT * FROM strategy_allocations WHERE user_id = $1',
    [userId]
  );
  return res.rows.map((r: any) => ({
    strategyId: r.strategy_id,
    strategyName: r.strategy_name,
    allocation: Number(r.allocation),
    weight: Number(r.weight),
    pnl24h: Number(r.pnl_24h),
  }));
}

// ---------- Performance ----------

export async function addPerformance(userId: string, series: { date: string; portfolio: number; benchmark: number }[]): Promise<void> {
  for (const p of series) {
    await pool.query(
      `INSERT INTO performance_series (user_id, date, portfolio, benchmark)
       VALUES ($1, $2, $3, $4)`,
      [userId, p.date, p.portfolio, p.benchmark]
    );
  }
}

export async function getPerformance(userId: string): Promise<{ date: string; portfolio: number; benchmark: number }[]> {
  const res = await pool.query(
    'SELECT * FROM performance_series WHERE user_id = $1 ORDER BY date',
    [userId]
  );
  return res.rows.map((r: any) => ({
    date: r.date,
    portfolio: Number(r.portfolio),
    benchmark: Number(r.benchmark),
  }));
}

// ---------- Audit logs ----------

export async function addAuditLog(userId: string, action: string, details: string): Promise<void> {
  await pool.query(
    'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
    [userId, action, details]
  );
}

export async function getAuditLogs(): Promise<AuditLogEntry[]> {
  const res = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC');
  return res.rows.map((r: any) => ({
    id: String(r.id),
    userId: r.user_id,
    action: r.action,
    details: r.details,
    createdAt: r.created_at,
  }));
}

// ---------- Withdrawal requests ----------

export async function addWithdrawalRequest(tx: Transaction): Promise<void> {
  await addTransaction(tx);
}

export async function getWithdrawalRequests(): Promise<Transaction[]> {
  const res = await pool.query(
    "SELECT * FROM transactions WHERE type = 'Withdrawal' AND status = 'Pending'"
  );
  return res.rows.map(mapTransaction);
}

export async function updateWithdrawalRequest(id: string, patch: Partial<Transaction>): Promise<Transaction | undefined> {
  const sets: string[] = [];
  const values: any[] = [];
  let i = 1;
  if (patch.status !== undefined) { sets.push(`status = $${i++}`); values.push(patch.status); }
  if (patch.approval1 !== undefined) { sets.push(`approval1 = $${i++}`); values.push(patch.approval1); }
  if (patch.approval2 !== undefined) { sets.push(`approval2 = $${i++}`); values.push(patch.approval2); }
  if (sets.length === 0) return undefined;
  values.push(id);
  const res = await pool.query(
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  if (res.rows.length === 0) return undefined;
  return mapTransaction(res.rows[0]);
}

// ---------- Ledger ----------

export async function getLedgerForUser(userId: string): Promise<LedgerEntry[]> {
  const res = await pool.query(
    'SELECT * FROM ledger_entries WHERE user_id = $1 ORDER BY id',
    [userId]
  );
  return res.rows.map((r: any) => ({
    id: String(r.id),
    userId: r.user_id,
    asset: r.asset,
    amount: Number(r.amount),
    entryType: r.entry_type,
    referenceId: r.reference_id,
    createdAt: r.created_at,
    integrityHash: r.integrity_hash,
  }));
}

export async function getAllLedger(): Promise<LedgerEntry[]> {
  const res = await pool.query('SELECT * FROM ledger_entries ORDER BY id');
  return res.rows.map((r: any) => ({
    id: String(r.id),
    userId: r.user_id,
    asset: r.asset,
    amount: Number(r.amount),
    entryType: r.entry_type,
    referenceId: r.reference_id,
    createdAt: r.created_at,
    integrityHash: r.integrity_hash,
  }));
}

// ---------- Stats ----------

export async function getDbStats() {
  const [users, wallets, addrs, ledger, txns, audit] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM users'),
    pool.query('SELECT COUNT(*) FROM wallets'),
    pool.query('SELECT COUNT(*) FROM deposit_addresses'),
    pool.query('SELECT COUNT(*) FROM ledger_entries'),
    pool.query('SELECT COUNT(*) FROM transactions'),
    pool.query('SELECT COUNT(*) FROM audit_logs'),
  ]);
  return {
    users: Number(users.rows[0].count),
    wallets: Number(wallets.rows[0].count),
    depositAddresses: Number(addrs.rows[0].count),
    ledgerEntries: Number(ledger.rows[0].count),
    transactions: Number(txns.rows[0].count),
    auditLogs: Number(audit.rows[0].count),
  };
}

export { pool };