/**
 * Official investment plans (server-side source of truth).
 *
 * Plan selection is strictly and exclusively based on the initial deposit
 * amount, using inclusive range matching:
 *   amount >= 20  && amount <= 499   → Bronze
 *   amount >= 500 && amount <= 1499  → Silver
 *   amount >= 1500 && amount <= 2499 → Diamond
 *   amount >= 2500 && amount <= 4999 → Gold
 *   amount >= 5000                   → Rhodium
 * A deposit below $20 has no plan and must be rejected.
 */

export interface InvestmentPlan {
  name: string;
  min: number;
  max: number | null; // null = no upper bound (Rhodium)
  dailyRate: number; // daily accrual percent, e.g. 7.0
  durationDays: number; // working days
}

export const INVESTMENT_PLANS: InvestmentPlan[] = [
  { name: 'Bronze', min: 20, max: 499, dailyRate: 5, durationDays: 50 },
  { name: 'Silver', min: 500, max: 1499, dailyRate: 7, durationDays: 100 },
  { name: 'Diamond', min: 1500, max: 2499, dailyRate: 10, durationDays: 150 },
  { name: 'Gold', min: 2500, max: 4999, dailyRate: 20, durationDays: 200 },
  { name: 'Rhodium', min: 5000, max: null, dailyRate: 30, durationDays: 250 },
];

/** The minimum deposit that maps to any plan. */
export const MIN_DEPOSIT = INVESTMENT_PLANS[0].min; // $20

/**
 * Deterministic plan lookup by deposit amount with inclusive boundaries.
 * Float amounts are handled correctly: 499.99 → Bronze, 500.00 → Silver.
 * Returns null when the amount is below the $20 minimum (no plan available).
 */
export function getPlanByAmount(amount: number): InvestmentPlan | null {
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) return null;
  for (const plan of INVESTMENT_PLANS) {
    if (amount >= plan.min && (plan.max === null || amount <= plan.max)) {
      return plan;
    }
  }
  return null; // unreachable — Rhodium is unbounded
}

/** Clear validation error thrown when a deposit is below the plan minimum. */
export class MinimumDepositError extends Error {
  constructor() {
    super(`Minimum deposit is $${MIN_DEPOSIT}. No plan available.`);
    this.name = 'MinimumDepositError';
  }
}

/**
 * Adds `n` working days to a date, skipping Saturdays and Sundays.
 * If the start date falls on a weekend, it is first advanced to Monday.
 */
export function addWorkingDays(start: Date, n: number): Date {
  const d = new Date(start.getTime());
  // Advance weekend start dates to the next working day.
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  let remaining = n;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return d;
}

/** Expected total payout at maturity: deposit * (1 + (dailyRate/100 * durationDays)). */
export function computeExpectedReturn(initialDeposit: number, dailyRate: number, durationDays: number): number {
  return Number((initialDeposit * (1 + (dailyRate / 100) * durationDays)).toFixed(2));
}

/** Counts whole working days between two dates (used for "days remaining"). */
export function workingDaysBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  const d = new Date(from.getTime());
  let count = 0;
  while (d.getTime() < to.getTime()) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}
