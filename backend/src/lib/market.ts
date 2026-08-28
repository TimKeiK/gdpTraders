/**
 * Market data service — CoinGecko proxy with a whitelist and TTL cache.
 *
 * Why a proxy: the browser should never be the one hammering CoinGecko
 * (free-tier rate limits are shared per IP and fragile). The backend
 * fetches, caches, and serves — one upstream request per TTL per coin.
 */

export interface CoinDef {
  /** CoinGecko id */
  id: string;
  /** Display symbol */
  symbol: string;
  /** Display name */
  name: string;
}

export const COINS: CoinDef[] = [
  { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
  { id: 'tether', symbol: 'USDT', name: 'Tether' },
];

export function isSupportedCoin(id: string): boolean {
  return COINS.some((c) => c.id === id);
}

export function getCoin(id: string): CoinDef {
  return COINS.find((c) => c.id === id) ?? COINS[0];
}

export interface Candle {
  time: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Maps the allowed range param to CoinGecko `days` + candle granularity note. */
export function resolveDays(range: string): '1' | '7' | '30' {
  if (range === '24h' || range === '1') return '1';
  if (range === '30d' || range === '30') return '30';
  return '7';
}

/**
 * Parse CoinGecko OHLC payloads: `[epochSeconds, open, high, low, close][]`.
 * Defensive: drops malformed rows, coerces numbers.
 */
export function parseOHLC(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const out: Candle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const [t, o, h, l, c] = row as unknown[];
    const time = Number(t);
    const open = Number(o);
    const high = Number(h);
    const low = Number(l);
    const close = Number(c);
    if (
      !Number.isFinite(time) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    out.push({ time: time * 1000, open, high, low, close });
  }
  return out;
}

// ---------- TTL cache ----------

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export function cacheGet<T>(key: string, now = Date.now()): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (now > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number, now = Date.now()): void {
  cache.set(key, { value, expiresAt: now + ttlMs });
}

// ---------- Upstream fetch ----------

const COINGECKO_BASE = process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3';
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY?.trim();

function geckoHeaders(): Record<string, string> {
  return COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {};
}

/** Fetch raw OHLC for a supported coin. Throws on upstream failure. */
export async function fetchOHLC(coinId: string, days: '1' | '7' | '30'): Promise<Candle[]> {
  const cacheKey = `ohlc:${coinId}:${days}`;
  const cached = cacheGet<Candle[]>(cacheKey);
  if (cached) return cached;

  const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url, { headers: geckoHeaders() });
  if (!res.ok) {
    throw new Error(`Upstream OHLC request failed (${res.status})`);
  }
  const candles = parseOHLC(await res.json());
  // Hourly/daily candles don't need sub-minute freshness; cache 60s.
  cacheSet(cacheKey, candles, 60_000);
  return candles;
}

export interface MarketSummary {
  coinId: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  lastUpdated: string;
}

/** Fetch the current price + 24h change for a supported coin. */
export async function fetchMarketSummary(coinId: string): Promise<MarketSummary> {
  const cacheKey = `summary:${coinId}`;
  const cached = cacheGet<MarketSummary>(cacheKey);
  if (cached) return cached;

  const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(
    coinId
  )}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, { headers: geckoHeaders() });
  if (!res.ok) {
    throw new Error(`Upstream price request failed (${res.status})`);
  }
  const body = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
  const entry = body[coinId];
  if (!entry || typeof entry.usd !== 'number') {
    throw new Error('Unexpected upstream price payload');
  }
  const coin = getCoin(coinId);
  const summary: MarketSummary = {
    coinId,
    symbol: coin.symbol,
    name: coin.name,
    priceUsd: entry.usd,
    change24h: typeof entry.usd_24h_change === 'number' ? entry.usd_24h_change : 0,
    lastUpdated: new Date().toISOString(),
  };
  cacheSet(cacheKey, summary, 30_000);
  return summary;
}
