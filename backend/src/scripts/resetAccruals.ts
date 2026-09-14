/**
 * One-shot reset for the simple-accrual cutover.
 *
 * Removes every automatic-accrual artifact credited under the OLD compound
 * engine and restores each active investment to a clean state so the scheduler
 * can re-credit every business day at the new FLAT rate (deposit × dailyRate%):
 *
 *   1. Deletes the accrual `ledger_entries` (reference_id = ACC-<date>-<id6>).
 *   2. Deletes the matching 'Daily Accrual' transactions.
 *   3. Deletes all `investment_accruals` rows (idempotency ledger).
 *   4. Refunds the previously credited total from `users.available_withdrawal`.
 *   5. Resets `investments.current_value` to the deposit + zeroes counters.
 *   6. Rechains the ledger `integrity_hash` column (sha256 chain) because
 *      deleting rows invalidates every hash after the first deletion point.
 *
 * Run with: npx tsx src/scripts/resetAccruals.ts
 * Requires DATABASE_URL pointing at the target database.
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import { getPlanByAmount, addWorkingDays, computeExpectedReturn } from '../data/plans.js';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://gdptrader:gdptrader_password@localhost:5433/gdptraders';

async function main() {
  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Collect every accrual transaction id + per-user totals.
    const accrualsRes = await client.query(`
      SELECT a.investment_id, i.user_id, a.business_date, a.amount,
             'ACC-' || to_char(a.business_date, 'YYYY-MM-DD') || '-' || RIGHT(a.investment_id, 6) AS tx_id
        FROM investment_accruals a
        JOIN investments i ON i.id = a.investment_id
    `);

    const txIds = accrualsRes.rows.map((r) => r.tx_id);
    const totalsByUser = new Map<string, number>();
    for (const r of accrualsRes.rows) {
      totalsByUser.set(r.user_id, (totalsByUser.get(r.user_id) ?? 0) + Number(r.amount));
    }
    const investmentIds = [...new Set(accrualsRes.rows.map((r) => r.investment_id as string))];

    console.log(`Found ${accrualsRes.rows.length} accrual rows across ${investmentIds.length} investments.`);
    for (const [userId, total] of totalsByUser) {
      console.log(`  ${userId}: previously credited $${total.toFixed(2)} (to be refunded + re-credited flat)`);
    }

    if (txIds.length > 0) {
      // 1) Delete accrual ledger entries.
      const delLedger = await client.query(`DELETE FROM ledger_entries WHERE reference_id = ANY($1)`, [txIds]);
      console.log(`Deleted ${delLedger.rowCount} ledger entries.`);

      // 2) Delete the 'Daily Accrual' transactions.
      const delTx = await client.query(`DELETE FROM transactions WHERE id = ANY($1)`, [txIds]);
      console.log(`Deleted ${delTx.rowCount} transactions.`);

      // 3) Delete the idempotency rows.
      const delAcc = await client.query(`DELETE FROM investment_accruals`);
      console.log(`Deleted ${delAcc.rowCount} investment_accruals rows.`);

      // 4) Refund the credited totals from available_withdrawal.
      for (const [userId, total] of totalsByUser) {
        await client.query(
          `UPDATE users SET available_withdrawal = GREATEST(0, available_withdrawal - $1) WHERE id = $2`,
          [total.toFixed(2), userId],
        );
        console.log(`Refunded $${total.toFixed(2)} from user ${userId}.`);
      }
    }

    // 5) Reset the investment counters to the deposit (simple-interest seed)
    //    and realign the stored plan snapshot with the OFFICIAL plan table
    //    (Bronze 3%/50d, Silver 5%/100d, Diamond 7%/150d, Gold 10%/200d,
    //    Rhodium 20%/250d). Admin overrides (plan_override = true) are kept.
    if (investmentIds.length > 0) {
      const resetInv = await client.query(
        `UPDATE investments
            SET current_value = initial_deposit,
                accrued_profit = 0,
                accrued_days = 0
          WHERE id = ANY($1)`,
        [investmentIds],
      );
      console.log(`Reset ${resetInv.rowCount} investments to deposit seed.`);

      const invRows = (await client.query(
        `SELECT id, initial_deposit, start_date, plan_override FROM investments WHERE id = ANY($1)`,
        [investmentIds],
      )).rows;
      for (const row of invRows) {
        if (row.plan_override) {
          console.log(`  ${row.id}: admin plan override kept (no realignment).`);
          continue;
        }
        const plan = getPlanByAmount(Number(row.initial_deposit));
        if (!plan) {
          console.warn(`  ${row.id}: deposit ${row.initial_deposit} below plan minimum — left untouched.`);
          continue;
        }
        const endDate = addWorkingDays(new Date(row.start_date), plan.durationDays);
        await client.query(
          `UPDATE investments
              SET assigned_plan = $1,
                  daily_rate = $2,
                  duration_days = $3,
                  end_date = $4,
                  total_expected_return = $5
            WHERE id = $6`,
          [
            plan.name,
            plan.dailyRate,
            plan.durationDays,
            endDate.toISOString(),
            computeExpectedReturn(Number(row.initial_deposit), plan.dailyRate, plan.durationDays),
            row.id,
          ],
        );
        console.log(
          `  ${row.id}: realigned to ${plan.name} — ${plan.dailyRate}%/day × ${plan.durationDays} working days, matures ${endDate.toISOString().slice(0, 10)}`,
        );
      }
    }

    // 6) Rechain the ledger hash chain (GENESIS -> sha256(prev + JSON(data))).
    const rows = (await client.query(
      `SELECT id, user_id, asset, amount, entry_type, reference_id, created_at
         FROM ledger_entries ORDER BY id`,
    )).rows;
    let prevHash = 'GENESIS';
    for (const row of rows) {
      const data = {
        userId: row.user_id,
        asset: row.asset,
        amount: Number(row.amount),
        entryType: row.entry_type,
        referenceId: row.reference_id,
        createdAt: row.created_at,
      };
      const hash = createHash('sha256').update(prevHash + JSON.stringify(data)).digest('hex');
      await client.query(`UPDATE ledger_entries SET integrity_hash = $1 WHERE id = $2`, [hash, row.id]);
      prevHash = hash;
    }
    console.log(`Rechained ${rows.length} ledger entries.`);

    await client.query('COMMIT');

    // Verify outside the transaction, replicating verifyLedgerIntegrity().
    const check = await pool.query(
      `SELECT id, user_id, asset, amount, entry_type, reference_id, created_at, integrity_hash
         FROM ledger_entries ORDER BY id`,
    );
    let verifyPrev = 'GENESIS';
    let valid = true;
    for (const row of check.rows) {
      const data = {
        userId: row.user_id,
        asset: row.asset,
        amount: Number(row.amount),
        entryType: row.entry_type,
        referenceId: row.reference_id,
        createdAt: row.created_at,
      };
      const computed = createHash('sha256').update(verifyPrev + JSON.stringify(data)).digest('hex');
      if (computed !== row.integrity_hash) {
        valid = false;
        console.error(`Chain broken at ledger id ${row.id}`);
        break;
      }
      verifyPrev = row.integrity_hash;
    }
    console.log(`Ledger integrity after rechain: ${valid ? 'VALID' : 'BROKEN'} (${check.rows.length} entries)`);
    if (!valid) process.exitCode = 1;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Reset failed:', err);
  process.exit(1);
});
