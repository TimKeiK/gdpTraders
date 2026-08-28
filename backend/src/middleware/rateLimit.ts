/**
 * Reusable in-memory fixed-window rate limiter (per IP + bucket key).
 *
 * Used as Express middleware via `rateLimit(opts)`, and directly for the
 * stricter auth throttling. Kept dependency-free so it is trivially testable.
 */
export interface RateLimitOptions {
  /** Max requests allowed within the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Bucket namespace (e.g. 'auth-login'). */
  key?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(identifier: string, opts: RateLimitOptions): RateLimitResult {
  const key = `${opts.key ?? 'global'}:${identifier}`;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { count: 0, resetAt: now + opts.windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + opts.windowMs;
  }
  bucket.count++;
  buckets.set(key, bucket);

  const allowed = bucket.count <= opts.max;
  return {
    allowed,
    remaining: Math.max(0, opts.max - bucket.count),
    retryAfterSec: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Periodic cleanup so long-running processes don't accumulate stale buckets. */
export function pruneRateLimits(now = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}

if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => pruneRateLimits(), 5 * 60_000);
  // Don't keep the process alive just for cleanup.
  timer.unref?.();
}

export function rateLimit(opts: RateLimitOptions) {
  return (req: { ip?: string; path?: string }, res: {
    status: (n: number) => { json: (b: unknown) => void };
    setHeader: (k: string, v: string) => void;
  }, next: () => void): void => {
    const id = req.ip || 'unknown';
    const result = checkRateLimit(id, opts);
    res.setHeader('Retry-After', String(result.retryAfterSec));
    if (!result.allowed) {
      res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfterSec: result.retryAfterSec,
      });
      return;
    }
    next();
  };
}
