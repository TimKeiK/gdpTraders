/**
 * Profit-reinvestment helpers.
 *
 * A reinvestment moves PROFIT out of the client's withdrawable balance and into
 * their invested capital (which raises the deposit the daily accrual is paid on).
 * Two buckets are involved and they must never disagree:
 *
 *   users.available_withdrawal — what the client can still withdraw (or reinvest)
 *   ledger 'profit' / 'loss'   — what the client has actually earned
 *
 * A reinvestment is a BUCKET MOVE, not income or expense, so:
 *   - it reduces the withdrawable balance (the money is no longer withdrawable),
 *   - it does NOT change the client's total portfolio value,
 *   - it must never be counted as a LOSS in the P&L breakdown, and
 *   - the same money can never be both withdrawn and reinvested.
 *
 * Pure functions only — no DB access — so this money math is unit-testable
 * without a database (same convention as lib/referrals.ts).
 */

/** Minimal shapes so both stores (pg + in-memory) can feed these helpers. */
export interface ReinvestTxLike {
  id?: string;
  type: string;
  status?: string;
  amount: number;
}

export interface LedgerEntryLike {
  entryType: string;
  amount: number;
  referenceId?: string | null;
}

/**
 * Un-reinvested profit:
 *   profit credits − loss debits − profit already committed to capital
 *
 * `reinvested` counts every Reinvest transaction that is not Cancelled, i.e.
 * Completed ones (already converted) AND Processing ones (reserved), so a
 * client can never queue the same profit twice.
 */
export function availableProfit(params: { profit: number; loss: number; reinvested: number }): number {
  const { profit, loss, reinvested } = params;
  return Math.max(0, profit - Math.abs(loss) - reinvested);
}

/**
 * Money committed to reinvestment requests that are still awaiting an admin
 * decision. Nothing has left `available_withdrawal` yet, so the withdrawable
 * balance must treat it as reserved — otherwise the client could request a
 * withdrawal for the same money while the reinvestment sits pending.
 */
export function pendingReinvestReserved(transactions: ReinvestTxLike[]): number {
  return transactions
    .filter((t) => t.type === 'Reinvest' && t.status === 'Processing')
    .reduce((sum, t) => sum + t.amount, 0);
}

/** Sum of every Reinvest transaction that is not Cancelled (Completed + pending). */
export function committedReinvestTotal(transactions: ReinvestTxLike[]): number {
  return transactions
    .filter((t) => t.type === 'Reinvest' && t.status !== 'Cancelled')
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Withdrawable balance that is not already spoken for by a pending
 * reinvestment: `available_withdrawal − reserved`. Never negative.
 */
export function uncommittedWithdrawable(params: {
  availableWithdrawal: number;
  reservedForReinvest: number;
}): number {
  const { availableWithdrawal, reservedForReinvest } = params;
  return Math.max(0, round2(availableWithdrawal - Math.max(0, reservedForReinvest)));
}

/**
 * How much the client may commit to a new reinvestment right now.
 *
 * SINGLE SPENDABLE BUCKET: `users.available_withdrawal` is the one number the
 * client sees, withdraws from and reinvests from — the deposit section shows the
 * same figure, so the two actions can never disagree. A reinvestment and a
 * withdrawal both draw this bucket down, which makes spending it twice
 * structurally impossible: whatever is already committed to a pending
 * reinvestment is reserved and therefore not offered again.
 *
 * The ledger's profit is a RECORD of what the client earned, not a spending
 * limit: an executed withdrawal lowers the bucket while the profit history stays
 * put, so capping by profit would be both wrong and confusing. Profit is still
 * reported (see `availableProfit`) for transparency and audit.
 */
export function reinvestableAmount(params: {
  availableWithdrawal: number;
  reservedForReinvest?: number;
}): number {
  return round2(
    uncommittedWithdrawable({
      availableWithdrawal: params.availableWithdrawal,
      reservedForReinvest: params.reservedForReinvest ?? 0,
    }),
  );
}

/**
 * Ledger entry reference ids created by CONFIRMED reinvestments.
 * Their ledger entries are bucket moves and must be excluded from P&L.
 */
export function completedReinvestIds(transactions: ReinvestTxLike[]): Set<string> {
  return new Set(
    transactions
      .filter((t) => t.type === 'Reinvest' && t.status === 'Completed' && t.id != null)
      .map((t) => t.id as string),
  );
}

/**
 * True when a ledger entry was produced by a reinvestment (cost-basis increase
 * or its balancing offset). Such entries must not be counted as profit or loss:
 * the client did not earn or lose anything, the money only changed bucket.
 */
export function isReinvestMove(entry: LedgerEntryLike, reinvestIds: Set<string>): boolean {
  return entry.referenceId != null && reinvestIds.has(String(entry.referenceId));
}

/** Rounds money to 2 decimals (ledger/balance precision used across the app). */
export function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Money for humans: 2 decimals without float-representation noise, safe for
 * interpolating into audit-log details and admin messages
 * (e.g. 27.619999999999999 → "27.62").
 */
export function money2(value: number): string {
  const v = Number(value);
  if (!Number.isFinite(v)) return '0.00';
  return (Math.round(v * 100) / 100).toFixed(2);
}
