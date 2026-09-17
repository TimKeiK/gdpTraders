/**
 * One-off manual accrual runner.
 *
 *   npm run accrual:run              # credits every unpaid business day
 *   npm run accrual:run -- --dry-run # preview only, writes nothing
 *   npm run accrual:run -- --force    # credit even while ACCRUAL_ENABLED=false
 *
 * The accrual CUTOVER (ACCRUAL_START_DATE, default 2026-09-18) is always
 * respected: business days before it were credited manually and are never
 * created, recalculated, modified, reversed or credited by this tool.
 *
 * A real (non-dry) run refuses to proceed while ACCRUAL_ENABLED=false unless
 * --force is passed, so a deployed-but-disabled system cannot be credited by
 * accident. --dry-run is always allowed (it writes nothing).
 *
 * Requires PostgreSQL (idempotent + atomic per-day writes).
 */
import { dbMode } from '../db/index.js';
import { runInvestmentAccrual } from '../services/accrual.js';
import { config } from '../config.js';

if (dbMode !== 'postgresql') {
  console.error('[accrual] Refusing to run: automatic accrual requires PostgreSQL.');
  console.error('[accrual] Start with docker compose (DATABASE_URL set) — not USE_IN_MEMORY_DB=true.');
  process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

if (!dryRun && !config.accrualEnabled && !force) {
  console.error(`Investment accrual scheduler disabled (ACCRUAL_ENABLED=${config.accrualEnabledRaw}).`);
  console.error('[accrual] Use --dry-run to preview, or --force to credit anyway (explicit override).');
  process.exit(1);
}

console.log(`[accrual] Cutover: first eligible date is ${config.accrualStartDate}. Earlier business days were handled manually and will not be touched.`);

const result = await runInvestmentAccrual({ dryRun });
console.log(dryRun ? '[accrual] DRY RUN (preview, nothing written)' : '[accrual] COMPLETE');
console.log(JSON.stringify(result, null, 2));
process.exit(0);