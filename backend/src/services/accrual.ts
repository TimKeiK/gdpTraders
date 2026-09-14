import { nanoid } from 'nanoid';
import { getAllActiveInvestments, getProcessedAccrualDates, creditDailyAccrual } from '../db/index.js';
import { computeDailyAccruals, enumerateBusinessDates, parseYmd, toYmd } from '../data/accrual.js';
import { getPlanByAmount } from '../data/plans.js';

export interface AccrualRunResult {
  scanned: number;
  creditedDays: number;
  investmentsMatured: number;
  totalProfit: number;
  skipped: number;
  dryRun: boolean;
}

/**
 * Runs the automatic daily accrual for every active investment in the database.
 *
 * How "from the initial deposit to now" works:
 *  - The set of eligible days = every business day AFTER `start_date` through
 *    today (inclusive), minus days already recorded in `investment_accruals`.
 *    The deposit day itself earns nothing — the first business day after the
 *    deposit is the first accrual.
 *  - The first run therefore backfills every unpaid working day since the
 *    deposit; subsequent daily runs only add the newest day.
 *  - Interest is SIMPLE: every business day pays the same flat amount
 *    (initial_deposit × dailyRate%). Previously credited profit never earns
 *    interest, so the math is deterministic no matter when a run happens.
 *
 * Each day is credited atomically by `creditDailyAccrual` (ledger + transaction
 * + available_withdrawal + balance update + maturity) in one transaction.
 */
export async function runInvestmentAccrual(opts: { dryRun?: boolean; now?: Date } = {}): Promise<AccrualRunResult> {
  const now = opts.now ?? new Date();
  const todayYmd = toYmd(now);
  const investments = await getAllActiveInvestments();

  let creditedDays = 0;
  let investmentsMatured = 0;
  let totalProfit = 0;
  let skipped = 0;

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

    const processed = new Set(await getProcessedAccrualDates(inv.id));
    const startYmd = toYmd(new Date(inv.startDate));
    // Accrual begins the DAY AFTER the deposit: the deposit day itself earns
    // nothing, the first business day after it does.
    const firstAccrualYmd = toYmd(new Date(parseYmd(startYmd).getTime() + 86400000));
    if (todayYmd <= startYmd) continue; // nothing to credit until the day after the deposit

    // Credit THROUGH today (inclusive) so the client sees today's profit on
    // the same business day. `enumerateBusinessDates` is end-exclusive, so we
    // pass tomorrow as the exclusive bound.
    const tomorrowYmd = toYmd(new Date(now.getTime() + 86400000));
    const candidates = enumerateBusinessDates(firstAccrualYmd, tomorrowYmd).filter((d) => !processed.has(d));
    if (candidates.length === 0) continue;

    // Simple interest: the daily profit is always derived from the INITIAL
    // DEPOSIT, never from the running balance. `balanceAfter` (deposit +
    // cumulative profit) is only persisted for display.
    const principal = inv.initialDeposit as number;
    const steps = computeDailyAccruals({ principal, dailyRatePercent: rate, dates: candidates });

    const endYmd = toYmd(new Date(inv.endDate));
    let accruedDays = processed.size;

    for (const step of steps) {
      const matured = step.date >= endYmd;
      accruedDays += 1;

      if (opts.dryRun) {
        creditedDays += 1;
        totalProfit += step.amount;
        if (matured) investmentsMatured += 1;
        continue;
      }

      const txId = `ACC-${step.date}-${inv.id.slice(-6)}`;
      const ok = await creditDailyAccrual(inv.id, {
        userId: inv.userId,
        businessDate: step.date,
        amount: step.amount,
        balanceAfter: step.balanceAfter,
        accruedDays,
        matured,
        principal: inv.initialDeposit,
        txId,
        txHash: `0x${nanoid(16)}`,
        strategy: `${inv.assignedPlan ?? 'Investment'} Plan Accrual`,
      });

      if (ok) {
        creditedDays += 1;
        totalProfit += step.amount;
        if (matured) investmentsMatured += 1;
      } else {
        accruedDays -= 1; // a concurrent process credited it → don't inflate the counter
      }
    }
  }

  return { scanned: investments.length, creditedDays, investmentsMatured, totalProfit, skipped, dryRun: !!opts.dryRun };
}

/** Daily scheduler — catch up on startup, then run on a fixed cadence. */
export function scheduleInvestmentAccrual(intervalMs = 12 * 60 * 60 * 1000): { clear: () => void } {
  const run = async () => {
    try {
      const res = await runInvestmentAccrual();
      if (res.creditedDays > 0 || res.investmentsMatured > 0) {
        console.log(
          `[accrual] scanned=${res.scanned} creditedDays=${res.creditedDays} matured=${res.investmentsMatured} profit=${res.totalProfit.toFixed(2)}`,
        );
      }
    } catch (err) {
      console.error('[accrual] run failed:', err);
    }
  };

  // Backfill on startup ("from the initial deposit till now"), then cadence.
  void run();
  const id = setInterval(() => void run(), intervalMs);
  return { clear: () => clearInterval(id) };
}