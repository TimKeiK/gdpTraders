import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeDailyAccruals,
  enumerateBusinessDates,
  isBusinessDay,
  toYmd,
  round2,
  parseYmd,
  DEFAULT_ACCRUAL_START_DATE,
  isValidYmd,
  parseEnabledFlag,
  shouldRunAccrualScheduler,
  firstBusinessDayOnOrAfter,
  firstEligibleAccrualDate,
  enumerateAccrualDates,
  maturityAction,
  maturedBeforeCutover,
  storedDateYmd,
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

test('storedDateYmd resolves stored timestamps to their calendar date in any timezone', () => {
  // `pg` returns investments.start_date/end_date as a Date whose LOCAL fields
  // hold the stored wall-clock date.
  assert.equal(storedDateYmd(new Date(2026, 8, 18, 0, 0, 0)), '2026-09-18');
  assert.equal(storedDateYmd(new Date(2026, 8, 18, 12, 0, 0)), '2026-09-18');
  // mapInvestment converts that Date with toISOString(); the round trip must
  // still yield the stored date. Using toYmd() here shifts a midnight timestamp
  // back one day on any host that is not UTC, moving the maturity boundary.
  const iso = new Date(2026, 8, 18, 0, 0, 0).toISOString();
  assert.equal(storedDateYmd(iso), '2026-09-18');
  // A lunchtime timestamp is immune even to a naive UTC slice.
  assert.equal(storedDateYmd(new Date(2026, 8, 18, 12, 0, 0).toISOString()), '2026-09-18');
  // Invalid input degrades to '' instead of throwing.
  assert.equal(storedDateYmd('not-a-date'), '');
});

/* -------------------------------------------------------------------------- */
/* Cutover (manual → automated accrual boundary)                              */
/* -------------------------------------------------------------------------- */

test('default accrual cutover is 2026-09-18 and is a business day', () => {
  assert.equal(DEFAULT_ACCRUAL_START_DATE, '2026-09-18');
  assert.equal(isBusinessDay(parseYmd(DEFAULT_ACCRUAL_START_DATE)), true);
});

test('isValidYmd rejects malformed and impossible dates', () => {
  assert.equal(isValidYmd('2026-09-18'), true);
  assert.equal(isValidYmd('2026-9-18'), false); // not zero-padded
  assert.equal(isValidYmd('2026-13-01'), false); // month 13
  assert.equal(isValidYmd('2026-02-30'), false); // impossible day
  assert.equal(isValidYmd(''), false);
  assert.equal(isValidYmd('garbage'), false);
  assert.equal(isValidYmd(undefined), false);
});

test('parseEnabledFlag only accepts the exact string "true"', () => {
  assert.equal(parseEnabledFlag('true'), true);
  assert.equal(parseEnabledFlag(' true '), true);
  assert.equal(parseEnabledFlag('false'), false);
  assert.equal(parseEnabledFlag('TRUE'), false); // strict: no accidental enabling
  assert.equal(parseEnabledFlag('1'), false);
  assert.equal(parseEnabledFlag(''), false);
  assert.equal(parseEnabledFlag(undefined), false);
});

test('ACCRUAL_ENABLED=false prevents the scheduler from running', () => {
  // Disabled (or unset) → never starts, even against PostgreSQL.
  assert.equal(shouldRunAccrualScheduler({ dbMode: 'postgresql', accrualEnabled: false }), false);
  // Opted in + PostgreSQL → starts.
  assert.equal(shouldRunAccrualScheduler({ dbMode: 'postgresql', accrualEnabled: true }), true);
  // The in-memory store never runs the scheduler (no atomic writes there).
  assert.equal(shouldRunAccrualScheduler({ dbMode: 'in-memory', accrualEnabled: true }), false);
  assert.equal(shouldRunAccrualScheduler({ dbMode: 'in-memory', accrualEnabled: false }), false);
});

test('firstBusinessDayOnOrAfter advances a weekend to the next business day', () => {
  // 2026-09-19 is a Saturday, 2026-09-20 a Sunday → Monday 2026-09-21.
  assert.equal(firstBusinessDayOnOrAfter('2026-09-19'), '2026-09-21');
  assert.equal(firstBusinessDayOnOrAfter('2026-09-20'), '2026-09-21');
  // A business day is returned unchanged.
  assert.equal(firstBusinessDayOnOrAfter('2026-09-18'), '2026-09-18');
});

test('firstEligibleAccrualDate clamps to max(start_date + 1 day, cutover)', () => {
  const cutoverYmd = DEFAULT_ACCRUAL_START_DATE;
  // Deposit long before the cutover → the cutover wins.
  assert.equal(firstEligibleAccrualDate({ startYmd: '2026-01-05', cutoverYmd }), cutoverYmd);
  // Deposit the day before the cutover → still the cutover (start + 1 = cutover).
  assert.equal(firstEligibleAccrualDate({ startYmd: '2026-09-17', cutoverYmd }), cutoverYmd);
  // Deposit ON the cutover → start + 1 (a Saturday) rolls to Monday.
  assert.equal(firstEligibleAccrualDate({ startYmd: '2026-09-18', cutoverYmd }), '2026-09-21');
  // Deposit after the cutover → the deposit day still earns nothing.
  assert.equal(firstEligibleAccrualDate({ startYmd: '2026-09-21', cutoverYmd }), '2026-09-22');
});

test('a cutover landing on a weekend starts on the next business day', () => {
  const cutoverYmd = '2026-09-19'; // Saturday
  assert.equal(firstEligibleAccrualDate({ startYmd: '2026-01-05', cutoverYmd }), '2026-09-21');
  const dates = enumerateAccrualDates({ startYmd: '2026-01-05', cutoverYmd, todayYmd: '2026-09-22' });
  assert.deepEqual(dates, ['2026-09-21', '2026-09-22']);
});

test('no date before ACCRUAL_START_DATE is ever processed', () => {
  const cutoverYmd = DEFAULT_ACCRUAL_START_DATE;
  // A months-old investment: every pre-cutover business day must be excluded,
  // even though the deposit (2026-01-05) is far in the past.
  const dates = enumerateAccrualDates({ startYmd: '2026-01-05', cutoverYmd, todayYmd: '2026-09-21' });
  assert.deepEqual(dates, ['2026-09-18', '2026-09-21']);
  assert.equal(dates.includes('2026-09-17'), false);
  assert.equal(dates.includes('2026-01-06'), false);
  assert.equal(dates.every((d) => d >= cutoverYmd), true);
  assert.equal(dates.every((d) => isBusinessDay(parseYmd(d))), true);

  // Deposit after the cutover → history starts the day after the deposit.
  assert.deepEqual(
    enumerateAccrualDates({ startYmd: '2026-09-21', cutoverYmd, todayYmd: '2026-09-25' }),
    ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'],
  );

  // Nothing eligible while today is before the cutover (a dry run must not show
  // a false backfill for earlier dates).
  assert.deepEqual(
    enumerateAccrualDates({ startYmd: '2026-01-05', cutoverYmd, todayYmd: '2026-09-17' }),
    [],
  );
});

test('enumerateAccrualDates excludes business days already credited', () => {
  const cutoverYmd = DEFAULT_ACCRUAL_START_DATE;
  const dates = enumerateAccrualDates({
    startYmd: '2026-01-05',
    cutoverYmd,
    todayYmd: '2026-09-21',
    processed: ['2026-09-18', '2026-01-06'],
  });
  assert.deepEqual(dates, ['2026-09-21']);
});

test('maturityAction credits the final day exactly once and skips past maturity', () => {
  const endYmd = '2026-09-18';
  // Before maturity, still active → a normal accrual day.
  assert.equal(maturityAction({ businessDateYmd: '2026-09-17', endYmd, status: 'active' }), 'accrue');
  // The final day → credits the day AND releases the principal.
  assert.equal(maturityAction({ businessDateYmd: '2026-09-18', endYmd, status: 'active' }), 'mature');
  // Already matured (a follow-up run) → the principal must NOT be released again.
  assert.equal(maturityAction({ businessDateYmd: '2026-09-18', endYmd, status: 'matured' }), 'skip');
  // Past maturity → nothing at all.
  assert.equal(maturityAction({ businessDateYmd: '2026-09-21', endYmd, status: 'active' }), 'skip');
  assert.equal(maturityAction({ businessDateYmd: '2026-09-21', endYmd, status: 'matured' }), 'skip');
  // No maturity date (legacy row without a plan snapshot) → nothing.
  assert.equal(maturityAction({ businessDateYmd: '2026-09-21', endYmd: null, status: 'active' }), 'skip');
});

test('principal is released exactly once when an investment matures', () => {
  const cutoverYmd = DEFAULT_ACCRUAL_START_DATE;
  const endYmd = '2026-09-21'; // matures AFTER the cutover
  // First run: the candidate window is cutover-limited and stops at maturity.
  const candidates = enumerateAccrualDates({
    startYmd: '2026-01-05',
    cutoverYmd,
    todayYmd: '2026-09-25',
  });
  assert.deepEqual(candidates, [
    '2026-09-18',
    '2026-09-21',
    '2026-09-22',
    '2026-09-23',
    '2026-09-24',
    '2026-09-25',
  ]);

  const firstRun = candidates.map((d) => maturityAction({ businessDateYmd: d, endYmd, status: 'active' }));
  assert.equal(firstRun.filter((a) => a === 'mature').length, 1, 'principal released exactly once');
  assert.equal(firstRun.filter((a) => a === 'accrue').length, 1);
  assert.equal(firstRun.filter((a) => a === 'skip').length, 4);

  // Second run (the investment is now 'matured'): zero accruals, zero principal.
  const secondRun = candidates.map((d) => maturityAction({ businessDateYmd: d, endYmd, status: 'matured' }));
  assert.equal(secondRun.filter((a) => a === 'mature').length, 0);
  assert.equal(secondRun.filter((a) => a === 'accrue').length, 0);
});

test('an investment matured before the cutover is skipped without principal credit', () => {
  const cutoverYmd = DEFAULT_ACCRUAL_START_DATE;
  const endYmd = '2026-05-25'; // matured during the manual era
  assert.equal(maturedBeforeCutover({ endYmd, cutoverYmd, status: 'active' }), true);

  // Even if it were still 'active', every candidate date falls after maturity,
  // so nothing is credited and the principal is never released.
  const candidates = enumerateAccrualDates({
    startYmd: '2026-01-05',
    cutoverYmd,
    todayYmd: '2026-09-25',
  });
  assert.equal(candidates.length, 6);
  assert.equal(candidates.every((d) => d >= cutoverYmd), true);
  const actions = candidates.map((d) => maturityAction({ businessDateYmd: d, endYmd, status: 'active' }));
  assert.equal(actions.filter((a) => a === 'mature').length, 0);
  assert.equal(actions.filter((a) => a === 'accrue').length, 0);
  assert.equal(actions.every((a) => a === 'skip'), true);
});

test('maturedBeforeCutover only flags active rows matured strictly before the cutover', () => {
  const cutoverYmd = DEFAULT_ACCRUAL_START_DATE;
  assert.equal(maturedBeforeCutover({ endYmd: '2026-05-25', cutoverYmd, status: 'active' }), true);
  // Already normalized → no repeat action.
  assert.equal(maturedBeforeCutover({ endYmd: '2026-05-25', cutoverYmd, status: 'matured' }), false);
  // Matures ON/AFTER the cutover → the automated engine owns it.
  assert.equal(maturedBeforeCutover({ endYmd: '2026-09-18', cutoverYmd, status: 'active' }), false);
  assert.equal(maturedBeforeCutover({ endYmd: '2026-09-21', cutoverYmd, status: 'active' }), false);
  // No plan snapshot → not our concern here.
  assert.equal(maturedBeforeCutover({ endYmd: null, cutoverYmd, status: 'active' }), false);
});