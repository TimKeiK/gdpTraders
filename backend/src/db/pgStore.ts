import { createHash } from 'crypto';
import pg from 'pg';
import { computeReferralCommission, generateCode } from '../lib/referrals.js';

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
  // Network a transaction travels on (e.g. USDT → TRC-20 or BEP-20).
  await pool.query(
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS network VARCHAR(20)`
  );
    // Client's saved constant withdrawal address (profile settings).
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_address VARCHAR(255)`
  );
  // Default network/asset for the saved constant withdrawal address (profile settings).
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_network VARCHAR(20)`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawal_asset VARCHAR(10)`
  );

  // Email-verification columns (added in the "email verification" change).
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE`
  );
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT`
  );
  // JWT tokens exceed 255 chars; widen any legacy VARCHAR column.
  await pool.query(
    `ALTER TABLE users ALTER COLUMN email_verification_token TYPE TEXT`
  );

  // Admin-set "available withdrawal" amount — how much of the client's
  // initial deposit + profit is currently withdrawable. Defaults to 0 so the
  // client only sees a withdrawable balance once an admin grants it.
  await pool.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS available_withdrawal NUMERIC(20, 2) DEFAULT 0`
  );
  await pool.query(
    `ALTER TABLE users ALTER COLUMN available_withdrawal SET DEFAULT 0`
  );
  await pool.query(
    `ALTER TABLE users ALTER COLUMN available_withdrawal TYPE NUMERIC(20, 2)`
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

  // Investments table - one row per confirmed deposit, snapshotting the
  // assigned plan, daily rate, duration, and expected return at record time.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS investments (
       id VARCHAR(50) PRIMARY KEY,
       user_id VARCHAR(50) NOT NULL REFERENCES users(id),
       initial_deposit NUMERIC(20, 2) NOT NULL,
       assigned_plan VARCHAR(50) NOT NULL,
       daily_rate NUMERIC(10, 2) NOT NULL,
       duration_days INTEGER NOT NULL,
       start_date TIMESTAMP NOT NULL DEFAULT NOW(),
       end_date TIMESTAMP NOT NULL,
       total_expected_return NUMERIC(20, 2) NOT NULL,
       status VARCHAR(20) NOT NULL DEFAULT 'active'
     )`
  );

  // ---- Legacy investments migration (idempotent) ----
  // Historical tables may predate the plan-snapshot columns and may use older
  // column names (amount → initial_deposit, created_at → start_date).
  await pool.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'amount')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'initial_deposit') THEN
      ALTER TABLE investments RENAME COLUMN amount TO initial_deposit;
    END IF;
  END $$;`);
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'start_date')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'created_at') THEN
      ALTER TABLE investments ADD COLUMN start_date TIMESTAMP;
      UPDATE investments SET start_date = created_at WHERE start_date IS NULL;
      ALTER TABLE investments ALTER COLUMN start_date SET NOT NULL;
    END IF;
  END $$;`);

  // Plan-snapshot columns are added NULLABLE so existing rows keep loading
  // until the backfill script populates them (run: npm run backfill:investments).
  await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS assigned_plan VARCHAR(50)`);
  await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10, 2)`);
  await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS duration_days INTEGER`);
  await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS end_date TIMESTAMP`);
  await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS total_expected_return NUMERIC(20, 2)`);
  await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`);
  // Admin plan overrides: when true the runtime amount-based fallback must not
  // revert this row's plan (e.g. an admin manually upgraded a client's tier).
  await pool.query(`ALTER TABLE investments ADD COLUMN IF NOT EXISTS plan_override BOOLEAN DEFAULT FALSE`);
  // Relax NOT NULL on the plan columns of older tables so historical rows
  // (which have no plan snapshot yet) do not break reads or the backfill.
  await pool.query(`DO $$ DECLARE c text; BEGIN
    FOREACH c IN ARRAY ARRAY['assigned_plan','daily_rate','duration_days','end_date','total_expected_return'] LOOP
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'investments' AND column_name = c AND is_nullable = 'NO') THEN
        EXECUTE format('ALTER TABLE investments ALTER COLUMN %I DROP NOT NULL', c);
      END IF;
    END LOOP;
  END $$;`);
  // Historical rows default to 'active' so old users still see a plan.
  await pool.query(`UPDATE investments SET status = 'active' WHERE status IS NULL`);
  // ---- Referral program: users columns + idempotent code backfill + earnings audit table ----
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id VARCHAR(50)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_referral_code ON users(referral_code)`);

  // Backfill a unique 8-char uppercase code for legacy users who don't have one yet.
  await pool.query(`
    DO \$\$
    DECLARE
      c TEXT;
      r RECORD;
    BEGIN
      FOR r IN SELECT id FROM users WHERE referral_code IS NULL LOOP
        c := NULL;
        WHILE c IS NULL LOOP
          c := upper(substr(md5(random()::text), 1, 8));
          IF EXISTS (SELECT 1 FROM users WHERE referral_code = c) THEN
            c := NULL;
          END IF;
        END LOOP;
        UPDATE users SET referral_code = c WHERE id = r.id;
      END LOOP;
    END \$\$;`);

  // Commission payout audit trail — kept in addition to the ledger hash-chain so
  // referral history survives ledger cleanup and is independently queryable.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_earnings (
      id BIGSERIAL PRIMARY KEY,
      referrer_user_id VARCHAR(50) NOT NULL,
      referred_user_id VARCHAR(50) NOT NULL,
      source_transaction_id VARCHAR(255),
      asset VARCHAR(10) NOT NULL,
      amount NUMERIC(20, 8) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_earnings_referrer ON referral_earnings(referrer_user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_user_id)`);

}

// ---------- Types (re-exported from database.ts) ----------
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
    withdrawalCap: number;
  isEmailVerified: boolean;
  emailVerificationToken: string | null;
  availableWithdrawal: number;
  withdrawalAddress?: string;
  withdrawalNetwork?: string | null;
  withdrawalAsset?: string | null;
  referralCode?: string;
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

/** One row per confirmed deposit, snapshotting the assigned plan.
 *  Plan fields are nullable so historical rows created before the plan logic
 *  still load; the API layer applies a runtime fallback (getPlanByAmount) and
 *  warns until the backfill script populates them. */
export interface Investment {
  id: string;
  userId: string;
  initialDeposit: number;
  assignedPlan: string | null;
  dailyRate: number | null;
  durationDays: number | null;
  startDate: string;
  endDate: string | null;
  totalExpectedReturn: number | null;
  status: string;
  /** True when an admin manually overrode this row's plan (see wallet.ts fallback). */
  planOverride?: boolean;
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
  type: 'Deposit' | 'Withdrawal' | 'Trade' | 'Fee' | 'Performance Fee' | 'Reinvest';
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

/** Result of atomically creditinga confirmed deposit plus (optionally)a referrer commission. */
export interface DepositConfirmationResult {
   depositEntry: LedgerEntry;
   commissions: { entry: LedgerEntry; earning: ReferralEarning; amount: number }[];
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
    return await appendLedgerEntryOnClient(client, userId, asset, amount, entryType, referenceId);
   } finally {
    client.release();
   }
}

/** Appends the next hash-chained ledger row on an existing pooled client (used inside a transaction so the caller controls commit/rollback). */
export async function appendLedgerEntryOnClient(
  client: any,
  userId: string,
  asset: string,
  amount: number,
  entryType: EntryType,
  referenceId: string
): Promise<LedgerEntry> {
  const lastRes = await client.query(
    'SELECT integrity_hash FROM ledger_entries ORDER BY id DESC LIMIT 1'
  );
  const previousHash = lastRes.rows[0]?.integrity_hash ?? 'GENESIS';

 const entry = {
   userId, asset, amount, entryType, referenceId,
   createdAt: new Date().toISOString(),
 };
 const integrityHash = createHash('sha256')
   .update(previousHash + JSON.stringify(entry))
   .digest('hex');

 const res = await client.query(
   `INSERT INTO ledger_entries (user_id, asset, amount, entry_type, reference_id, integrity_hash)
    VALUES ($1,$2,$3,$4,$5,$6)
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
}

/**
 * Atomically confirms a deposit ledger credit and, when the depositor was referred,
 * pays a 5% commission to the referrer (same ledger hash-chain, same asset)and
 * records the payout in `referral_earnings`. Wrapped in ONE PostgreSQL transaction so
 * neither the credit northe commission can partially commit. A concurrent hash-chain
 * (ledger_entries ORDER BY id) is safely serialized by the transaction's write lock.


 * The referrer is resolved inside the transaction from the depositor's `referred_by_user_id`
 * (immutable, set once at registration). The commission amount is 5% of the actual
 * confirmed/credited amount (the admin-edited value, not the client's declared amount).
 */
export async function appendDepositAndReferralCommission(
  userId: string,
  asset: string,
  amount: number,
  referenceId: string
): Promise<DepositConfirmationResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const depositEntry = await appendLedgerEntryOnClient(client, userId, asset, amount, 'deposit', referenceId);

    const depRes = await client.query(
      'SELECT referred_by_user_id FROM users WHERE id = $1',
      [userId]
    );
    const referredBy: string | null | undefined = depRes.rows[0]?.referred_by_user_id ?? null;

    const commissions: { entry: LedgerEntry; earning: ReferralEarning; amount: number }[] = [];
    // Defensive: the referrer must be a real, existing user (never the depositor
    // themselves) before any commission is paid.
    let referrerExists = false;
    if (referredBy && referredBy !== userId) {
      const refRes = await client.query('SELECT 1 FROM users WHERE id = $1', [referredBy]);
      referrerExists = refRes.rows.length > 0;
    }
    if (referredBy && referredBy !== userId && referrerExists) {

      const commissionAmount = computeReferralCommission(amount);
      if (commissionAmount > 0) {
        const entry = await appendLedgerEntryOnClient(client, referredBy, asset, commissionAmount, 'referral_commission', referenceId);
        await client.query(
          `INSERT INTO referral_earnings (referrer_user_id, referred_user_id, source_transaction_id, asset, amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [referredBy, userId, referenceId, asset, commissionAmount]
        );
        const earning: ReferralEarning = {
          id: `${referenceId}-comm`,
          referrerUserId: referredBy,
          referredUserId: userId,
          sourceTransactionId: referenceId,
          asset,
          amount: commissionAmount,
          createdAt: new Date().toISOString(),
        };
        commissions.push({ entry, earning, amount: commissionAmount });
      }
    }
    await client.query('COMMIT');
    return { depositEntry, commissions };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
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
  const referralCode = user.referralCode?.trim().toUpperCase() || await generateUniqueReferralCode();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, name, role, kyc_status, ip_whitelist, withdrawal_cap, is_email_verified, email_verification_token, available_withdrawal, withdrawal_address, withdrawal_network, withdrawal_asset, referral_code, referred_by_user_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (id) DO NOTHING`,
    [user.id, user.email, user.passwordHash, user.name, user.role, user.kycStatus,
     user.ipWhitelist, user.withdrawalCap, user.isEmailVerified, user.emailVerificationToken,
     user.availableWithdrawal ?? 0, user.withdrawalAddress ?? null,
     user.withdrawalNetwork ?? null, user.withdrawalAsset ?? null,
     referralCode, user.referredByUserId ?? null, user.createdAt]
  );
}

export async function removeUser(id: string): Promise<void> {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
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

export async function setAvailableWithdrawal(userId: string, amount: number): Promise<void> {
  await pool.query(
    'UPDATE users SET available_withdrawal = $1 WHERE id = $2',
    [amount, userId]
  );
}

// ---------- Investments ----------

export async function addInvestment(inv: Investment): Promise<void> {
  await pool.query(
    `INSERT INTO investments (id, user_id, initial_deposit, assigned_plan, daily_rate, duration_days, start_date, end_date, total_expected_return, status, plan_override)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO NOTHING`,
    [inv.id, inv.userId, inv.initialDeposit, inv.assignedPlan, inv.dailyRate,
     inv.durationDays, inv.startDate, inv.endDate, inv.totalExpectedReturn, inv.status, inv.planOverride ?? false]
  );
}

/** Replaces the plan snapshot of an existing investment row in place.
 *  Used by the admin investment-plan override so the client's Overview and
 *  Profile Settings (both read the investments table) reflect the change. */
export async function updateInvestment(inv: Investment): Promise<void> {
  await pool.query(
    `INSERT INTO investments (id, user_id, initial_deposit, assigned_plan, daily_rate, duration_days, start_date, end_date, total_expected_return, status, plan_override)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       initial_deposit = EXCLUDED.initial_deposit,
       assigned_plan = EXCLUDED.assigned_plan,
       daily_rate = EXCLUDED.daily_rate,
       duration_days = EXCLUDED.duration_days,
       end_date = EXCLUDED.end_date,
       total_expected_return = EXCLUDED.total_expected_return,
       status = EXCLUDED.status,
       plan_override = EXCLUDED.plan_override`,
    [inv.id, inv.userId, inv.initialDeposit, inv.assignedPlan, inv.dailyRate,
     inv.durationDays, inv.startDate, inv.endDate, inv.totalExpectedReturn, inv.status, inv.planOverride ?? false]
  );
}

function mapInvestment(r: any): Investment {
  // Plan-snapshot columns may be NULL on legacy rows (pre-plan-logic history).
  return {
    id: r.id,
    userId: r.user_id,
    initialDeposit: Number(r.initial_deposit ?? r.amount ?? 0),
    assignedPlan: r.assigned_plan ?? null,
    dailyRate: r.daily_rate != null ? Number(r.daily_rate) : null,
    durationDays: r.duration_days != null ? Number(r.duration_days) : null,
    startDate: new Date(r.start_date ?? r.created_at ?? Date.now()).toISOString(),
    endDate: r.end_date ? new Date(r.end_date).toISOString() : null,
    totalExpectedReturn: r.total_expected_return != null ? Number(r.total_expected_return) : null,
    status: r.status ?? 'active',
    planOverride: !!r.plan_override,
  };
}

/** All investments for a user, newest first. */
export async function getInvestmentsForUser(userId: string): Promise<Investment[]> {
  const res = await pool.query(
    'SELECT * FROM investments WHERE user_id = $1 ORDER BY start_date DESC',
    [userId]
  );
  return res.rows.map(mapInvestment);
}

/** The user's most recent active investment, or undefined. */
export async function getActiveInvestmentForUser(userId: string): Promise<Investment | undefined> {
  const res = await pool.query(
    `SELECT * FROM investments WHERE user_id = $1 AND status = 'active' ORDER BY start_date DESC LIMIT 1`,
    [userId]
  );
  return res.rows.length > 0 ? mapInvestment(res.rows[0]) : undefined;
}

export async function updateUserName(userId: string, name: string): Promise<void> {
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, userId]);
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

export async function setWithdrawalAddress(userId: string, address: string): Promise<void> {
  await pool.query(
    'UPDATE users SET withdrawal_address = $1 WHERE id = $2',
    [address, userId]
  );
}

/** Saves the client's default withdrawal coin + network (profile settings). */
export async function setDefaultWithdrawalInfo(
  userId: string,
  address: string,
  network?: string,
  asset?: string
): Promise<void> {
  const net = network ?? null;
  const a = asset ?? null;
  await pool.query(
    'UPDATE users SET withdrawal_address = $1, withdrawal_network = $2, withdrawal_asset = $3 WHERE id = $4',
    [address, net, a, userId]
  );
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
    availableWithdrawal: Number(row.available_withdrawal ?? 0),
    withdrawalAddress: row.withdrawal_address ?? undefined,
    withdrawalNetwork: row.withdrawal_network ?? null,
    withdrawalAsset: row.withdrawal_asset ?? null,
    referralCode: row.referral_code ?? undefined,
    referredByUserId: row.referred_by_user_id ?? null,
    createdAt: row.created_at,
  };
}

// ---------- Referrals (PostgreSQL store, dual-store parity with database.ts) ----------

export async function findUserByReferralCode(code: string): Promise<User | undefined> {
  const res = await pool.query(
    'SELECT * FROM users WHERE UPPER(referral_code) = UPPER($1)',
    [code.trim()]
  );
  if (res.rows.length === 0) return undefined;
  return mapUser(res.rows[0]);
}

export async function getReferredUserIds(referrerId: string): Promise<string[]> {
  const res = await pool.query(
    'SELECT id FROM users WHERE referred_by_user_id = $1',
    [referrerId]
  );
  return res.rows.map((r) => r.id);
}

export async function generateUniqueReferralCode(): Promise<string> {
  for (;;) {
    const code = generateCode();
    const res = await pool.query('SELECT 1 FROM users WHERE referral_code = $1', [code]);
    if (res.rows.length === 0) return code;
  }
}

export async function addReferralEarning(earning: ReferralEarning): Promise<void> {
  await pool.query(
    `INSERT INTO referral_earnings (referrer_user_id, referred_user_id, source_transaction_id, asset, amount)
     VALUES ($1,$2,$3,$4,$5)`,
    [earning.referrerUserId, earning.referredUserId, earning.sourceTransactionId, earning.asset, earning.amount]
  );
}

export async function getReferralEarningsForUser(referrerUserId: string): Promise<ReferralEarning[]> {
  const res = await pool.query(
    'SELECT * FROM referral_earnings WHERE referrer_user_id = $1 ORDER BY created_at DESC',
    [referrerUserId]
  );
  return res.rows.map(mapReferralEarning);
}

export async function getAllReferralEarnings(): Promise<ReferralEarning[]> {
  const res = await pool.query('SELECT * FROM referral_earnings ORDER BY created_at DESC');
  return res.rows.map(mapReferralEarning);
}

function mapReferralEarning(r: any): ReferralEarning {
  return {
    id: String(r.id),
    referrerUserId: r.referrer_user_id,
    referredUserId: r.referred_user_id,
    sourceTransactionId: r.source_transaction_id,
    asset: r.asset,
    amount: Number(r.amount),
    createdAt: r.created_at,
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
    `INSERT INTO transactions (id, user_id, date, type, asset, amount, strategy, status, tx_hash, destination_address, network, requires_approval, approval1, approval2)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       date = EXCLUDED.date,
       type = EXCLUDED.type,
       asset = EXCLUDED.asset,
       amount = EXCLUDED.amount,
       strategy = EXCLUDED.strategy,
       status = EXCLUDED.status,
       tx_hash = EXCLUDED.tx_hash,
       destination_address = EXCLUDED.destination_address,
       network = EXCLUDED.network,
       requires_approval = EXCLUDED.requires_approval,
       approval1 = EXCLUDED.approval1,
       approval2 = EXCLUDED.approval2`,
    [tx.id, tx.userId, tx.date, tx.type, tx.asset, tx.amount, tx.strategy, tx.status,
     tx.txHash, tx.destinationAddress ?? null, tx.network ?? null, tx.requiresApproval ?? false, tx.approval1 ?? false, tx.approval2 ?? false]
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
    network: r.network ?? undefined,
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
