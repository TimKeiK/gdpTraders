/**
 * Backfill script — populates the plan snapshot columns on historical
 * `investments` rows created before the plan logic existed.
 *
 * Idempotent: only rows WHERE assigned_plan IS NULL are touched, and updates
 * set every snapshot field deterministically from the deposit amount, so
 * running it multiple times never duplicates updates or corrupts data.
 *
 * Run with:  npm run backfill:investments
 *
 * Also prints the verification query result (Task 5): the count of rows that
 * still have assigned_plan IS NULL after the backfill — must be 0 when done
 * (excluding sub-$20 rows, which are flagged 'under_review' by design).
 */
import 'dotenv/config';
import { pool } from '../db/pgStore.js';
import { getPlanByAmount, addWorkingDays, computeExpectedReturn, MIN_DEPOSIT } from '../data/plans.js';

async function backfill(): Promise<void> {
  console.log('[backfill] Starting investments plan backfill…');

  // Fetch only unassigned rows. Rows already backfilled (assigned_plan NOT NULL)
  // are never selected again — that is what makes re-runs no-ops.
  const { rows } = await pool.query(
    `SELECT id, user_id, initial_deposit, start_date
       FROM investments
      WHERE assigned_plan IS NULL
      ORDER BY start_date ASC`,
  );

  console.log(`[backfill] Found ${rows.length} investment(s) without a plan snapshot.`);

  let assigned = 0;
  let underReview = 0;

  for (const row of rows) {
    const amount = Number(row.initial_deposit);
    const startDate = new Date(row.start_date);
    const plan = getPlanByAmount(amount);

    if (!plan) {
      // Historical amount below the $20 minimum: flag for review, skip plan.
      await pool.query(
        `UPDATE investments
            SET status = 'under_review'
          WHERE id = $1 AND assigned_plan IS NULL`,
        [row.id],
      );
      underReview += 1;
      console.warn(
        `[backfill] ${row.id}: amount $${amount} < $${MIN_DEPOSIT} minimum — flagged 'under_review', no plan assigned.`,
      );
      continue;
    }

    const endDate = addWorkingDays(startDate, plan.durationDays);
    const expectedReturn = computeExpectedReturn(amount, plan.dailyRate, plan.durationDays);

    // The WHERE assigned_plan IS NULL guard makes this update idempotent even
    // under concurrent runs: a row backfilled between SELECT and UPDATE is skipped.
    const res = await pool.query(
      `UPDATE investments
          SET assigned_plan = $2,
              daily_rate = $3,
              duration_days = $4,
              end_date = $5,
              total_expected_return = $6,
              status = CASE WHEN status IS NULL OR status = '' THEN 'active' ELSE status END
        WHERE id = $1 AND assigned_plan IS NULL`,
      [row.id, plan.name, plan.dailyRate, plan.durationDays, endDate, expectedReturn],
    );

    if (res.rowCount && res.rowCount > 0) {
      assigned += 1;
      console.log(
        `[backfill] ${row.id}: $${amount} → ${plan.name} (${plan.dailyRate}%/day, ${plan.durationDays} working days, ` +
          `ends ${endDate.toISOString().slice(0, 10)}, expected $${expectedReturn.toLocaleString()})`,
      );
    }
  }

  // ---- Task 5: verification query ----
  // Confirms the migration is complete: remaining NULLs should be 0.
  const verification = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE assigned_plan IS NULL)                                                        AS still_null,
       COUNT(*) FILTER (WHERE status = 'under_review')                                                      AS under_review,
       COUNT(*) FILTER (WHERE assigned_plan IS NOT NULL)                                                    AS backfilled,
       COUNT(*)                                                                                             AS total
     FROM investments`,
  );
  const v = verification.rows[0];

  console.log('\n[backfill] Done.');
  console.log(`  Assigned plan snapshots : ${assigned}`);
  console.log(`  Flagged under_review    : ${underReview}`);
  console.log('\n[backfill] Verification (Task 5):');
  console.log(`  Rows still assigned_plan IS NULL : ${v.still_null}`);
  console.log(`  Rows backfilled (have plan)      : ${v.backfilled}`);
  console.log(`  Rows under_review (< $${MIN_DEPOSIT})       : ${v.under_review}`);
  console.log(`  Total investments                : ${v.total}`);
  if (Number(v.still_null) === 0) {
    console.log('\n[backfill] ✔ Migration complete — no rows remain without a plan snapshot.');
  } else {
    console.log('\n[backfill] ⚠ Some rows are still unassigned — re-run this script.');
    process.exitCode = 1;
  }

  await pool.end();
}

backfill().catch((err) => {
  console.error('[backfill] Failed:', err);
  process.exitCode = 1;
});
