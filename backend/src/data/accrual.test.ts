import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeDailyAccruals,
  enumerateBusinessDates,
  isBusinessDay,
  toYmd,
  round2,
  parseYmd,
} from './accrual.js';

test('isBusinessDay excludes weekends', () => {
  // 2026-09-14 is a Monday; 2026-09-12 is a Saturday.
  assert.equal(isBusinessDay(parseYmd('2026-09-14')), true);
  assert.equal(isBusinessDay(parseYmd('2026-09-12')), false);
  assert.equal(isBusinessDay(parseYmd('2026-09-13')), false);
  assert.equal(isBusinessDay(parseYmd('2026-09-18')), true);
});

test('enumerateBusinessDates skips weekends within a range', () => {
  // Mon..Fri week: expect exactly those 5 days.
  const dates = enumerateBusinessDates('2026-09-14', '2026-09-21');
  assert.deepEqual(dates, ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']);
});

test('computeDailyAccruals pays flat simple interest on the deposit', () => {
  // 5% simple over 2 business days on a $500 deposit.
  const steps = computeDailyAccruals({
    principal: 500,
    dailyRatePercent: 5,
    dates: ['2026-09-14', '2026-09-15'],
  });
  assert.equal(steps.length, 2);
  // Day 1: 500 * 0.05 = 25 -> balance 525
  assert.equal(steps[0].amount, 25);
  assert.equal(steps[0].balanceAfter, 525);
  // Day 2: still 25 (deposit-based, NOT 525 * 0.05) -> balance 550
  assert.equal(steps[1].amount, 25);
  assert.equal(steps[1].balanceAfter, 550);
});

test('computeDailyAccruals $20 Bronze example: 3% = $0.60 every business day', () => {
  const steps = computeDailyAccruals({
    principal: 20,
    dailyRatePercent: 3,
    dates: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'],
  });
  for (const s of steps) assert.equal(s.amount, 0.6);
  // After 5 business days: 20 + 5 * 0.6 = 23
  assert.equal(steps[4].balanceAfter, 23);
});

test('computeDailyAccruals rounding is stable at 2 decimals', () => {
  const steps = computeDailyAccruals({ principal: 100.0, dailyRatePercent: 3, dates: ['2026-09-14', '2026-09-15'] });
  for (const s of steps) assert.equal(round2(s.amount), s.amount);
});

test('toYmd returns UTC date string', () => {
  assert.equal(toYmd(new Date(Date.UTC(2026, 8, 14, 12, 30))), '2026-09-14');
});