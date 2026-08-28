import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COINS,
  cacheGet,
  cacheSet,
  getCoin,
  isSupportedCoin,
  parseOHLC,
  resolveDays,
} from '../lib/market.js';
import { checkRateLimit, pruneRateLimits } from '../middleware/rateLimit.js';

test('coin whitelist contains exactly btc, eth, usdt', () => {
  assert.deepEqual(
    COINS.map((c) => c.id).sort(),
    ['bitcoin', 'ethereum', 'tether']
  );
  assert.ok(isSupportedCoin('bitcoin'));
  assert.ok(!isSupportedCoin('dogecoin'));
  assert.equal(getCoin('ethereum').symbol, 'ETH');
});

test('resolveDays maps ranges correctly', () => {
  assert.equal(resolveDays('24h'), '1');
  assert.equal(resolveDays('7d'), '7');
  assert.equal(resolveDays('30d'), '30');
  assert.equal(resolveDays('garbage'), '7');
});

test('parseOHLC keeps valid rows and drops malformed ones', () => {
  const raw = [
    [1700000000, '100', 110, 95, 105],
    [1700003600, 'bad', 1, 2, 3], // non-numeric -> dropped
    [1700007200, 101, 111, 96, 106, 'extra ignored'],
    ['nope', 1, 2, 3, 4], // bad time -> dropped
    'junk', // not an array -> dropped
  ];
  const candles = parseOHLC(raw);
  assert.equal(candles.length, 2);
  assert.deepEqual(candles[0], {
    time: 1700000000 * 1000,
    open: 100,
    high: 110,
    low: 95,
    close: 105,
  });
  assert.equal(parseOHLC(null).length, 0);
});

test('ttl cache expires entries', () => {
  const key = `k:${Math.random()}`;
  cacheSet(key, { v: 1 }, 50, 1000);
  assert.deepEqual(cacheGet(key, 1040), { v: 1 });
  assert.equal(cacheGet(key, 2000), undefined); // expired
});

test('rate limiter allows under max and blocks over it', () => {
  const id = `test-ip-${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    const r = checkRateLimit(id, { max: 3, windowMs: 1000, key: 't' });
    assert.ok(r.allowed, `request ${i + 1} should pass`);
  }
  const blocked = checkRateLimit(id, { max: 3, windowMs: 1000, key: 't' });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 0);
});

test('pruneRateLimits clears expired buckets', () => {
  const id = `prune-${Math.random()}`;
  checkRateLimit(id, { max: 1, windowMs: 10, key: 'p' });
  pruneRateLimits(Date.now() + 60_000);
  // Bucket was pruned, so a fresh check starts from zero and is allowed.
  const r = checkRateLimit(id, { max: 1, windowMs: 10, key: 'p' });
  assert.ok(r.allowed);
});
