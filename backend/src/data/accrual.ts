/**
 * Pure accrual engine for GDPTraders.
 *
 * Everything here is a deterministic, dependency-free function so the
 * interest math can be unit-tested without a database. The scheduler
 * (`src/services/accrual.ts`) orchestrates these against PostgreSQL.
 *
 * Concepts match the plan engine (`src/data/plans.ts`):
 *  - Accrual happens only on BUSINESS days (Mon-Fri, UTC).
 *  - Daily accrual is SIMPLE interest on the INITIAL DEPOSIT: every business
 *    day earns the same flat amount (deposit × dailyRate%). Profit already
 *    credited does NOT earn interest — only the original deposit does.
 *  - The running balance (deposit + profit so far) is persisted
 *    (`investments.current_value`) for display/resume purposes; the daily
 *    profit itself is always derived from the deposit, so the math is
 *    deterministic regardless of how many days were credited before.
 */

export interface AccrualStep {
  /** YYYY-MM-DD (UTC) business day this step earns on. */
  date: string;
  /** The profit credited this day (money, capped at 2 decimals). */
  amount: number;
  /** Running balance AFTER this day's interest is applied. */
  balanceAfter: number;
}

/** Default major non-trading market holidays (YYYY-MM-DD in UTC). */
export const DEFAULT_HOLIDAYS = new Set<string>([
  '2026-01-01', // New Year's Day
  '2026-12-25', // Christmas Day
]);

/** True for Monday-Friday (UTC) excluding market holidays. Weekends never accrue. */
export function isBusinessDay(d: Date, holidays: Set<string> = DEFAULT_HOLIDAYS): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const ymd = toYmd(d);
  if (holidays.has(ymd)) return false;
  return true;
}

/** YYYY-MM-DD (UTC). */
export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * YYYY-MM-DD for a STORED `timestamp without time zone` value
 * (`investments.start_date` / `end_date`).
 *
 * `pg` parses those columns into LOCAL time, so their local calendar fields hold
 * the stored wall-clock date. Slicing a UTC ISO string instead (`toYmd`) loses a
 * day on any host whose timezone is not UTC — which would move the accrual window
 * and the maturity (principal-release) boundary by one day.
 *
 * Accepts either the raw `Date` from pg or the ISO string produced by
 * `mapInvestment`; both resolve back to the same local calendar date.
 */
export function storedDateYmd(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** UTC midnight for a YYYY-MM-DD string. */
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Round to 2 decimals (money). Ledger + balances live at 2 decimals here. */
export function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * Business days in [start, endExclusive) — weekends excluded, aligned with
 * `addWorkingDays` / `workingDaysBetween`. Returns YYYY-MM-DD strings.
 */
export function enumerateBusinessDates(start: string, endExclusive: string): string[] {
  const end = parseYmd(endExclusive);
  const out: string[] = [];
  for (let cur = parseYmd(start); cur.getTime() < end.getTime(); cur = new Date(cur.getTime() + 86400000)) {
    if (isBusinessDay(cur)) out.push(toYmd(cur));
  }
  return out;
}

/**
 * Simple daily accrual. Each business date earns a FLAT amount:
 *   `principal * (dailyRatePercent / 100)`
 * computed on the INITIAL DEPOSIT only — previously credited profit never
 * earns interest, so every business day pays the same amount until maturity.
 *
 * `balanceAfter` is the running total (deposit + all profit credited so far),
 * persisted as `investments.current_value` for display purposes.
 */
export function computeDailyAccruals(params: {
  principal: number;
  dailyRatePercent: number;
  dates: string[];
  /**
   * Running balance to continue FROM (initial deposit + profit already
   * credited). Defaults to `principal` (a fresh plan).
   *
   * The daily amount is ALWAYS derived from `principal` — this parameter only
   * keeps the persisted `balance_after` / `current_value` running total correct
   * after a mid-term capital change (e.g. a profit reinvestment raises the
   * deposit). Without it the next run would reset the running total to
   * deposit + this run's days, erasing every day credited before the change.
   */
  startingBalance?: number;
}): AccrualStep[] {
  const { principal, dailyRatePercent, dates, startingBalance } = params;
  const rate = dailyRatePercent / 100;
  const dailyAmount = round2(principal * rate);
  let balance = round2(startingBalance ?? principal);
  return dates.map((date) => {
    balance = round2(balance + dailyAmount);
    return { date, amount: dailyAmount, balanceAfter: balance };
  });
}

/* -------------------------------------------------------------------------- */
/* Cutover (manual → automated accrual boundary)                              */
/* -------------------------------------------------------------------------- */

/**
 * First date the AUTOMATED engine is allowed to pay.
 *
 * Every business day before this date was credited manually by an operator, so
 * the scheduler must never create, recalculate, modify, reverse or credit it.
 * Deployed with `ACCRUAL_ENABLED=false` first, then enabled deliberately on
 * the cutover date.
 */
export const DEFAULT_ACCRUAL_START_DATE = '2026-09-18';

/** Strict `YYYY-MM-DD` check — rejects malformed values and impossible dates. */
export function isValidYmd(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toYmd(parseYmd(value)) === value;
}

/**
 * Reads a boolean env flag. Only the EXACT string `true` enables a feature, so
 * a typo or an unset variable can never turn automated money movement on.
 */
export function parseEnabledFlag(raw: string | undefined | null): boolean {
  return (raw ?? '').trim() === 'true';
}

/**
 * Whether the boot-time scheduler may start. Requires PostgreSQL (the accrual
 * writes are atomic + idempotent only there) AND an explicit opt-in flag.
 */
export function shouldRunAccrualScheduler(params: { dbMode: string; accrualEnabled: boolean }): boolean {
  return params.dbMode === 'postgresql' && params.accrualEnabled === true;
}

/** Next business day on or after `ymd` (`ymd` itself when already a business day). */
export function firstBusinessDayOnOrAfter(
  ymd: string,
  holidays: Set<string> = DEFAULT_HOLIDAYS,
): string {
  let cur = parseYmd(ymd);
  // Bounded walk (max 7 days) so a pathological holiday set can never loop.
  for (let i = 0; i < 7; i += 1) {
    if (isBusinessDay(cur, holidays)) return toYmd(cur);
    cur = new Date(cur.getTime() + 86400000);
  }
  return toYmd(cur);
}

/**
 * First automated accrual date for one investment:
 *   `max(start_date + 1 day, ACCRUAL_START_DATE)`, advanced to the next business
 *   day when that lands on a weekend/holiday.
 *
 * The deposit day itself never earns, and any date before the cutover is
 * permanently out of scope (handled manually).
 */
export function firstEligibleAccrualDate(params: {
  startYmd: string;
  cutoverYmd: string;
  holidays?: Set<string>;
}): string {
  const { startYmd, cutoverYmd, holidays = DEFAULT_HOLIDAYS } = params;
  const dayAfterDeposit = toYmd(new Date(parseYmd(startYmd).getTime() + 86400000));
  // Per-investment history is manual before the cutover → clamp to the cutover.
  const lowerBound = dayAfterDeposit > cutoverYmd ? dayAfterDeposit : cutoverYmd;
  return firstBusinessDayOnOrAfter(lowerBound, holidays);
}

/**
 * Business dates that still need crediting for one investment: business days in
 * `[firstEligibleAccrualDate, today]` minus days already recorded in
 * `investment_accruals`.
 *
 * Hard guarantee: the result NEVER contains a date before `cutoverYmd`, so no
 * pre-cutover row, ledger entry, transaction or balance change can be written.
 */
export function enumerateAccrualDates(params: {
  startYmd: string;
  cutoverYmd: string;
  todayYmd: string;
  processed?: Iterable<string>;
  holidays?: Set<string>;
}): string[] {
  const { startYmd, cutoverYmd, todayYmd, processed = [], holidays = DEFAULT_HOLIDAYS } = params;
  const first = firstEligibleAccrualDate({ startYmd, cutoverYmd, holidays });
  if (first > todayYmd) return []; // nothing eligible yet
  const processedSet = new Set(processed);
  const tomorrowYmd = toYmd(new Date(parseYmd(todayYmd).getTime() + 86400000));
  return enumerateBusinessDates(first, tomorrowYmd).filter(
    (d) => d >= cutoverYmd && !processedSet.has(d) && isBusinessDay(parseYmd(d), holidays),
  );
}

/** What to do with one business date for an investment that matures on `endYmd`. */
export type MaturityAction = 'accrue' | 'mature' | 'skip';

/**
 * Classifies a single business date:
 *  - `accrue` → a normal pre-maturity day while the plan is still active
 *  - `mature` → the final day (`business_date === end_date`); credits the day's
 *    profit AND releases the principal exactly once
 *  - `skip`   → past maturity, or the investment is already matured (so the
 *    principal can never be released a second time)
 */
export function maturityAction(params: {
  businessDateYmd: string;
  endYmd: string | null | undefined;
  status: string | null | undefined;
}): MaturityAction {
  const { businessDateYmd, endYmd, status } = params;
  if (!endYmd) return 'skip';
  if (businessDateYmd > endYmd) return 'skip'; // never accrues past maturity
  if (status !== 'active') return 'skip'; // already matured → no second principal
  return businessDateYmd === endYmd ? 'mature' : 'accrue';
}

/**
 * True when an investment matured BEFORE the cutover. Those rows belong to the
 * manual era: their principal is assumed already handled, so the normalizer
 * flips them to `matured` without touching any balance.
 */
export function maturedBeforeCutover(params: {
  endYmd: string | null | undefined;
  cutoverYmd: string;
  status: string | null | undefined;
}): boolean {
  const { endYmd, cutoverYmd, status } = params;
  if (!endYmd) return false;
  if (status !== 'active') return false;
  return endYmd < cutoverYmd;
}

/* -------------------------------------------------------------------------- */
/* Term economics (used when capital changes mid-term, e.g. a reinvestment)    */
/* -------------------------------------------------------------------------- */

export interface InvestmentTermSummary {
  /** Total business days the plan actually accrues: (start_date, end_date]. */
  termDays: number;
  /** Business days still to be credited, the maturity day included. */
  remainingDays: number;
  /**
   * Expected total payout at maturity:
   *   profit already credited + deposit + profit still to be credited.
   */
  expectedTotalReturn: number;
}

/** Business days in [fromInclusive, toInclusive] (empty when the range is inverted). */
function countBusinessDays(fromInclusive: string, toInclusive: string, holidays: Set<string>): number {
  if (fromInclusive > toInclusive) return 0;
  const exclusiveEnd = toYmd(new Date(parseYmd(toInclusive).getTime() + 86400000));
  return enumerateBusinessDates(fromInclusive, exclusiveEnd).filter((d) =>
    isBusinessDay(parseYmd(d), holidays),
  ).length;
}

/**
 * Term economics for an investment whose capital changed mid-term.
 *
 * A reinvestment raises the deposit (which raises the daily accrual and can move
 * the client up a plan tier) but does NOT extend the term — the plan still
 * matures on the `end_date` the client originally agreed to. Because the daily
 * amount is always derived from the CURRENT deposit and the CURRENT plan rate,
 * the only honest "expected total payout" is:
 *
 *   profit already credited
 *   + deposit
 *   + deposit × dailyRate% × remaining business days (maturity day included)
 *
 * `termDays` likewise reports the REAL term (business days in
 * (start_date, end_date]) rather than the new tier's nominal duration, so the
 * displayed term, the maturity date and the expected payout always agree.
 */
export function investmentTermSummary(params: {
  startYmd: string;
  endYmd: string;
  todayYmd: string;
  deposit: number;
  dailyRatePercent: number;
  /** Profit the plan has already paid out (automated accruals). */
  alreadyCreditedProfit?: number;
  holidays?: Set<string>;
}): InvestmentTermSummary {
  const {
    startYmd,
    endYmd,
    todayYmd,
    deposit,
    dailyRatePercent,
    alreadyCreditedProfit = 0,
    holidays = DEFAULT_HOLIDAYS,
  } = params;

  const dayAfterStart = toYmd(new Date(parseYmd(startYmd).getTime() + 86400000));
  const termDays = countBusinessDays(dayAfterStart, endYmd, holidays);
  // The first business day the deposit earns is start_date + 1, so a reinvest
  // on the deposit day itself still has the full term ahead of it.
  const remainingFrom = todayYmd > dayAfterStart ? todayYmd : dayAfterStart;
  const remainingDays = countBusinessDays(remainingFrom, endYmd, holidays);

  const dailyAmount = round2(deposit * (dailyRatePercent / 100));
  const futureProfit = round2(dailyAmount * remainingDays);
  return {
    termDays,
    remainingDays,
    expectedTotalReturn: round2(alreadyCreditedProfit + deposit + futureProfit),
  };
}