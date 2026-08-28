/**
 * Central, validated application configuration.
 *
 * Fails fast at boot when running in production with insecure defaults
 * (e.g. the known dev JWT secret). Never silently fall back to a hardcoded
 * secret in production.
 */
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
};

if (config.isProd && config.jwtSecret.length < 32) {
  throw new Error('[config] JWT_SECRET must be at least 32 characters in production');
}
