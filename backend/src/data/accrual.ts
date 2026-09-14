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

/** True for Monday-Friday (UTC). Weekends never accrue. */
export function isBusinessDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

/** YYYY-MM-DD (UTC). */
export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
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
}): AccrualStep[] {
  const { principal, dailyRatePercent, dates } = params;
  const rate = dailyRatePercent / 100;
  const dailyAmount = round2(principal * rate);
  let balance = principal;
  return dates.map((date) => {
    balance = round2(balance + dailyAmount);
    return { date, amount: dailyAmount, balanceAfter: balance };
  });
}