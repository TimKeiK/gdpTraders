import { nanoid } from 'nanoid';
import { getAllActiveInvestments, getProcessedAccrualDates, creditDailyAccrual } from '../db/index.js';
import {
  computeDailyAccruals,
  firstBusinessDayOnOrAfter,
  firstEligibleAccrualDate,
  enumerateAccrualDates,
  maturityAction,
  maturedBeforeCutover,
  storedDateYmd,
  toYmd,
  isBusinessDay,
  round2,
} from '../data/accrual.js';
import { getPlanByAmount } from '../data/plans.js';
import { config } from '../config.js';

export interface AccrualRunResult {
  scanned: number;
  creditedDays: number;
  investmentsMatured: number;
  totalProfit: number;
  skipped: number;
  /** Investments matured BEFORE the cutover (manual era) — skipped, never credited. */
  skippedMaturedBeforeCutover: number;
  /** Dates dropped because they fall after the investment's maturity date. */
  skippedPastMaturity: number;
  /** The cutover date this run respected (ACCRUAL_START_DATE). */
  cutoverDate: string;
  /** First date automated accruals could pay, given the cutover. */
  firstEligibleDate: string;
  /** Whether the automated scheduler is switched on (ACCRUAL_ENABLED). */
  enabled: boolean;
  dryRun: boolean;
}

/** Logged once per process so operators can confirm the boundary in the logs. */
let cutoverLogged = false;

/**
 * Runs the automatic daily accrual for every active investment in the database.
 *
 * CUTOVER (`ACCRUAL_START_DATE`, default 2026-09-18):
 *  - Every business day BEFORE the cutover was credited manually by an operator.
 *    Those days are permanently out of scope: `enumerateAccrualDates` never
 *    yields them, and `creditDailyAccrual` refuses to insert them even if asked.
 *  - Eligible days for one investment = business days in
 *    `[max(start_date + 1 day, ACCRUAL_START_DATE), today]` minus days already
 *    recorded in `investment_accruals`. If the cutover falls on a weekend the
 *    first automated accrual is the next business day.
 *  - The deposit day itself earns nothing.
 *  - Interest is SIMPLE: every business day pays the same flat amount
 *    (initial_deposit × dailyRate%). Previously credited profit never earns
 *    interest, so the math is deterministic no matter when a run happens.
 *  - Accruing stops at `end_date`: that final day credits the day's profit and
 *    releases the principal EXACTLY ONCE (enforced again inside the SQL
 *    transaction). Dates after `end_date` are skipped entirely.
 *
 * Each day is credited atomically by `creditDailyAccrual` (ledger + transaction
 * + available_withdrawal + balance update + maturity) in one transaction.
 */
export async function runInvestmentAccrual(
  opts: { dryRun?: boolean; now?: Date; cutoverYmd?: string } = {},
): Promise<AccrualRunResult> {
  const now = opts.now ?? new Date();
  const todayYmd = toYmd(now);
  const cutoverYmd = opts.cutoverYmd ?? config.accrualStartDate;

  if (!cutoverLogged) {
    cutoverLogged = true;
    console.log(`Accrual cutover active: first eligible date is ${cutoverYmd}.`);
  }

  const investments = await getAllActiveInvestments();

  let creditedDays = 0;
  let investmentsMatured = 0;
  let totalProfit = 0;
  let skipped = 0;
  let skippedMaturedBeforeCutover = 0;
  let skippedPastMaturity = 0;

  for (const inv of investments) {
    // The OFFICIAL plan table (src/data/plans.ts) is the single source of truth
    // for the daily rate: Bronze 3%, Silver 5%, Diamond 7%, Gold 10%,
    // Rhodium 20%. The rate is derived from the investment's deposit amount on
    // every run, so a stale stored snapshot can never drive payouts. Only an
    // explicit admin plan override (plan_override = true) keeps its own rate.
    const override = inv.planOverride === true;
    const plan = override ? null : getPlanByAmount(inv.initialDeposit);
    const rate = override ? (inv.dailyRate ?? 0) : (plan?.dailyRate ?? inv.dailyRate ?? 0);
    if (rate == null || rate <= 0 || !inv.endDate) {
      skipped += 1;
      continue;
    }

    const startYmd = storedDateYmd(inv.startDate);
    const endYmd = storedDateYmd(inv.endDate);

    // Manual-era investments: matured BEFORE the cutover. Their principal was
    // handled by an operator outside the automated engine, so we only report
    // them (ensureSchema flips their status to 'matured') and never credit.
    if (maturedBeforeCutover({ endYmd, cutoverYmd, status: inv.status })) {
      skippedMaturedBeforeCutover += 1;
      console.log(
        `[accrual] Skipped investment ${inv.id} (user ${inv.userId}): matured ${endYmd}, ` +
          `before the cutover ${cutoverYmd} — principal assumed handled manually, no credit applied.`,
      );
      continue;
    }

    const processed = new Set(await getProcessedAccrualDates(inv.id));
    const firstEligibleYmd = firstEligibleAccrualDate({ startYmd, cutoverYmd });
    if (todayYmd < firstEligibleYmd) continue; // nothing eligible yet

    // Credit THROUGH today (inclusive) so the client sees today's profit on the
    // same business day — never before the cutover and never before the first
    // business day after the deposit.
    const candidates = enumerateAccrualDates({ startYmd, cutoverYmd, todayYmd, processed });
    if (candidates.length === 0) continue;

    // Simple interest: the daily profit is always derived from the INITIAL
    // DEPOSIT, never from the running balance. `balanceAfter` (deposit +
    // cumulative profit) is only persisted for display.
    const principal = inv.initialDeposit as number;
    const steps = computeDailyAccruals({ principal, dailyRatePercent: rate, dates: candidates });

    let accruedDays = processed.size;

    for (const step of steps) {
      // `skip` = past maturity, or the investment is already matured — which is
      // what makes a second principal release impossible.
      const action = maturityAction({ businessDateYmd: step.date, endYmd, status: inv.status });
      if (action === 'skip') {
        skippedPastMaturity += 1;
        continue;
      }
      const matured = action === 'mature';
      accruedDays += 1;

      if (opts.dryRun) {
        creditedDays += 1;
        totalProfit += step.amount;
        if (matured) investmentsMatured += 1;
        continue;
      }

      const txId = `ACC-${step.date}-${inv.id.slice(-6)}`;
      const res = await creditDailyAccrual(inv.id, {
        userId: inv.userId,
        businessDate: step.date,
        amount: step.amount,
        balanceAfter: step.balanceAfter,
        accruedDays,
        matured,
        principal: inv.initialDeposit,
        cutoverYmd,
        txId,
        txHash: `0x${nanoid(16)}`,
        strategy: `${inv.assignedPlan ?? 'Investment'} Plan Accrual`,
      });

      if (res.credited) {
        creditedDays += 1;
        totalProfit += step.amount;
        if (res.principalReleased) {
          investmentsMatured += 1;
          console.log(
            `[accrual] Principal released: investment ${inv.id}, user ${inv.userId}, ` +
              `amount $${round2(principal).toFixed(2)}, business date ${step.date} (plan matured).`,
          );
        }
      } else {
        accruedDays -= 1; // DB guard rejected it (already credited / out of scope)
      }
    }
  }

  return {
    scanned: investments.length,
    creditedDays,
    investmentsMatured,
    totalProfit: round2(totalProfit),
    skipped,
    skippedMaturedBeforeCutover,
    skippedPastMaturity,
    cutoverDate: cutoverYmd,
    firstEligibleDate: firstBusinessDayOnOrAfter(cutoverYmd),
    enabled: config.accrualEnabled,
    dryRun: !!opts.dryRun,
  };
}

export interface SchedulerState {
  status: 'active' | 'running' | 'idle';
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: AccrualRunResult | null;
}

const schedulerState: SchedulerState = {
  status: 'idle',
  lastRunAt: null,
  nextRunAt: null,
  lastResult: null,
};

/** Compute the next 00:01:00 UTC cutoff time. */
export function getNextMidnightUtc(now = new Date()): Date {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 1, 0, 0,
  ));
  return next;
}

/** Exposes the live scheduler status for admin inspection (cutover-aware). */
export function getSchedulerStatus(cutoverYmd: string = config.accrualStartDate) {
  const now = new Date();
  return {
    ...schedulerState,
    /** Whether the boot-time scheduler is switched on (ACCRUAL_ENABLED). */
    enabled: config.accrualEnabled,
    /** First date automated accruals may pay. */
    cutoverDate: cutoverYmd,
    /** Cutover advanced to the next business day when it lands on a weekend. */
    firstEligibleDate: firstBusinessDayOnOrAfter(cutoverYmd),
    isBusinessDayToday: isBusinessDay(now),
    currentUtcDate: toYmd(now),
  };
}

/**
 * Production-grade daily business-day accrual scheduler:
 *  1. Catch-up on startup: scans from ACCRUAL_START_DATE (or each investment's
 *     deposit date when later) to today — never earlier than the cutover.
 *  2. Schedules next run precisely at upcoming 00:01:00 UTC.
 *  3. Runs an hourly heartbeat sanity check in case of server sleep / clock drift.
 *
 * Refuses to start unless ACCRUAL_ENABLED === 'true'. `index.ts` already gates
 * this call, so the guard here is defence-in-depth: the scheduler can never be
 * started accidentally from another entry point.
 */
export function scheduleInvestmentAccrual(): { clear: () => void } {
  if (!config.accrualEnabled) {
    console.log(`Investment accrual scheduler disabled (ACCRUAL_ENABLED=${config.accrualEnabledRaw})`);
    return { clear: () => {} };
  }

  let timeoutId: NodeJS.Timeout | null = null;
  let intervalId: NodeJS.Timeout | null = null;

  const execute = async () => {
    schedulerState.status = 'running';
    try {
      const res = await runInvestmentAccrual();
      schedulerState.lastRunAt = new Date().toISOString();
      schedulerState.lastResult = res;
      if (res.creditedDays > 0 || res.investmentsMatured > 0) {
        console.log(
          `[accrual] scanned=${res.scanned} creditedDays=${res.creditedDays} matured=${res.investmentsMatured} profit=${res.totalProfit.toFixed(2)}`,
        );
      }
    } catch (err) {
      console.error('[accrual] run failed:', err);
    } finally {
      schedulerState.status = 'active';
    }
  };

  const scheduleNextMidnight = () => {
    const next = getNextMidnightUtc();
    schedulerState.nextRunAt = next.toISOString();
    const msUntil = Math.max(1000, next.getTime() - Date.now());

    timeoutId = setTimeout(async () => {
      await execute();
      scheduleNextMidnight();
    }, msUntil);
  };

  // 1. Initial startup catch-up (cutover-limited: never before ACCRUAL_START_DATE)
  void execute().then(() => {
    // 2. Schedule exact midnight UTC cadence
    scheduleNextMidnight();
  });

  // 3. Hourly heartbeat check (guards against clock drift / missed wakeups)
  intervalId = setInterval(async () => {
    const now = new Date();
    const todayYmd = toYmd(now);
    const lastYmd = schedulerState.lastRunAt ? toYmd(new Date(schedulerState.lastRunAt)) : null;
    if (isBusinessDay(now) && lastYmd !== todayYmd) {
      console.log(`[accrual] Heartbeat detected uncredited business day (${todayYmd}). Triggering catch-up...`);
      await execute();
    }
  }, 60 * 60 * 1000);

  return {
    clear: () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      schedulerState.status = 'idle';
    },
  };
}