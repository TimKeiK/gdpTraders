/**
 * Official deposit plans (client-facing). A client's active plan is derived
 * from their initial deposit (total confirmed deposits / cost basis).
 * The plan upgrades automatically as the initial capital grows (e.g. through
 * approved profit reinvestments).
 */
export interface InvestmentPlan {
  name: string;
  icon: string;
  min: number;
  max: number | null; // null = no upper bound
  dailyAccrual: number; // percent
  duration: number; // working days
}

export const INVESTMENT_PLANS: InvestmentPlan[] = [
  { name: 'Bronze Plan', icon: '🥉', min: 20, max: 499, dailyAccrual: 3, duration: 50 },
  { name: 'Silver Plan', icon: '🥈', min: 500, max: 1499, dailyAccrual: 5, duration: 100 },
  { name: 'Diamond Plan', icon: '💎', min: 1500, max: 2499, dailyAccrual: 7, duration: 150 },
  { name: 'Gold Plan', icon: '🥇', min: 2500, max: 4999, dailyAccrual: 10, duration: 200 },
  { name: 'Rhodium Plan', icon: '👑', min: 5000, max: null, dailyAccrual: 20, duration: 250 },
];

export const MIN_DEPOSIT = INVESTMENT_PLANS[0].min;

/** Returns the plan a given initial deposit qualifies for, or null if below the minimum. */
export function getPlanForDeposit(initialDeposit: number): InvestmentPlan | null {
  return INVESTMENT_PLANS.find((p) => initialDeposit >= p.min) ?? null;
}

/** Human-readable deposit range for a plan, e.g. "$20 – $499" or "$5,000+". */
export function planRange(p: InvestmentPlan): string {
  return p.max === null
    ? `${formatUsd(p.min)}+`
    : `${formatUsd(p.min)} – ${formatUsd(p.max)}`;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString()}`;
}
