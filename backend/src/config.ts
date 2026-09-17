/**
 * Central, validated application configuration.
 *
 * Fails fast at boot when running in production with insecure defaults
 * (e.g. the known dev JWT secret). Never silently fall back to a hardcoded
 * secret in production.
 */
import { DEFAULT_ACCRUAL_START_DATE, isValidYmd } from './data/accrual.js';

const isProd = process.env.NODE_ENV === 'production';

const DEV_DEFAULT = 'gdptraders_dev_secret_change_me_in_production';

function requiredSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    if (isProd) {
      throw new Error(`[config] Missing required env var: ${name}`);
    }
    // Dev fallback so local/non-docker dev still boots.
    return DEV_DEFAULT;
  }
  if (value === DEV_DEFAULT && isProd) {
    throw new Error(
      `[config] ${name} is still set to the known dev default. Generate a strong secret before running in production.`
    );
  }
  return value;
}

/**
 * Automatic-accrual cutover date (`ACCRUAL_START_DATE`).
 *
 * The first date the automated engine may pay. Every business day before it was
 * credited manually and is permanently out of scope for the scheduler. Fails
 * fast on a malformed value so a typo can never silently shift the boundary.
 */
function requiredAccrualStartDate(): string {
  const raw = process.env.ACCRUAL_START_DATE?.trim();
  if (!raw) return DEFAULT_ACCRUAL_START_DATE;
  if (!isValidYmd(raw)) {
    throw new Error(`[config] ACCRUAL_START_DATE must be a valid YYYY-MM-DD date (got "${raw}")`);
  }
  return raw;
}

/**
 * `ACCRUAL_ENABLED` — opt-in switch for the boot-time accrual scheduler.
 * Only the exact string "true" enables it; anything else (including unset)
 * leaves the scheduler off. Deploy with it off, verify on staging, then enable
 * deliberately on the cutover date.
 */
const accrualEnabledRaw = process.env.ACCRUAL_ENABLED?.trim() ?? 'false';

export const config = {
  env: isProd ? ('production' as const) : ('development' as const),
  isProd,
  port: parseInt(process.env.PORT || '8000', 10),
  jwtSecret: requiredSecret('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  /** True only when ACCRUAL_ENABLED === "true". Defaults to false. */
  accrualEnabled: accrualEnabledRaw === 'true',
  /** Raw ACCRUAL_ENABLED value, for accurate log/status output. */
  accrualEnabledRaw,
  /** First date automated accruals may pay (ACCRUAL_START_DATE, default 2026-09-18). */
  accrualStartDate: requiredAccrualStartDate(),
};

if (config.isProd && config.jwtSecret.length < 32) {
  throw new Error('[config] JWT_SECRET must be at least 32 characters in production');
}
