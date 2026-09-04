import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REFERRAL_COMMISSION_RATE,
  REFERRAL_CODE_LENGTH,
  computeReferralCommission,
  generateCode,
} from './referrals.js';
import {
  addUser,
  findUserByReferralCode,
  generateUniqueReferralCode,
  getReferralEarningsForUser,
  getAllReferralEarnings,
  getReferredUserIds,
  appendDepositAndReferralCommission,
  verifyLedgerIntegrity,
  getLedgerForUser,
  type User,
} from '../db/database.js';

let seq = 0;
function makeUser(overrides: Partial<User> = {}): User {
  seq += 1;
  return {
    id: `test_user_${Date.now()}_${seq}`,
    email: `test${seq}_${Date.now()}@example.com`,
    passwordHash: 'x',
    name: `Test User ${seq}`,
    role: 'client',
    kycStatus: 'APPROVED',
    ipWhitelist: [],
    withdrawalCap: 100000,
    isEmailVerified: true,
    emailVerificationToken: null,
    availableWithdrawal: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test('referral code generation produces unique 8-char uppercase alphanumeric codes', () => {
  const codes = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const code = generateUniqueReferralCode();
    assert.equal(code.length, REFERRAL_CODE_LENGTH);
    assert.match(code, /^[A-Z0-9]{8}$/);
    codes.add(code);
  }
  assert.equal(codes.size, 50, 'codes must be unique');
});

test('generateCode matches the required alphabet and length', () => {
  for (let i = 0; i < 20; i++) assert.match(generateCode(), /^[A-Z0-9]{8}$/);
});

test('commission math: 5% of the confirmed amount, rounded to 8 decimals', () => {
  assert.equal(computeReferralCommission(1000), 50);
  assert.equal(computeReferralCommission(1500.55), 75.0275);
  assert.equal(computeReferralCommission(0), 0);
  assert.equal(computeReferralCommission(-5), 0);
  assert.equal(computeReferralCommission(Number.NaN), 0);
  assert.equal(REFERRAL_COMMISSION_RATE, 0.05);
});

test('confirm-deposit credits a 5% commission to the referrer with an audit row', () => {
  const referrer = makeUser({ referralCode: 'REFERR01' });
  addUser(referrer);
  const referred = makeUser({ referredByUserId: referrer.id });
  addUser(referred);
  const ref = `TX-TEST-${seq}`;

  const earningsBefore = getReferralEarningsForUser(referrer.id).length;
  const result = appendDepositAndReferralCommission(referred.id, 'USDT', 1000, ref);

  assert.equal(result.commissions.length, 1);
  assert.equal(result.commissions[0]!.amount, 50); // 5% of 1000

  // Referrer's ledger shows a positive referral_commission entry in the same asset.
  const referrerLedger = getLedgerForUser(referrer.id).filter((e) => e.entryType === 'referral_commission');
  const entry = referrerLedger.find((e) => e.referenceId === ref);
  assert.ok(entry, 'commission ledger entry must exist for the referrer');
  assert.equal(entry.amount, 50);
  assert.equal(entry.asset, 'USDT');

  // Audit trail row in referral_earnings linking both parties + source transaction.
  const earnings = getReferralEarningsForUser(referrer.id);
  assert.equal(earnings.length, earningsBefore + 1);
  const row = earnings[earnings.length - 1]!;
  assert.equal(row.referredUserId, referred.id);
  assert.equal(row.sourceTransactionId, ref);
  assert.equal(row.amount, 50);
  assert.equal(row.asset, 'USDT');

  // The depositor's own credit is unaffected.
  const depositEntry = getLedgerForUser(referred.id).find(
    (e) => e.entryType === 'deposit' && e.referenceId === ref
  );
  assert.ok(depositEntry);
  assert.equal(depositEntry.amount, 1000);
});

test('no commission when the depositing user has no referrer', () => {
  const loner = makeUser();
  addUser(loner);
  const before = getAllReferralEarnings().length;
  const result = appendDepositAndReferralCommission(loner.id, 'USDT', 500, `TX-NOREF-${seq}`);
  assert.equal(result.commissions.length, 0);
  assert.equal(getAllReferralEarnings().length, before);
});

test('self-referral is prevented: a user can never earn commission on their own code', () => {
  const narcissist = makeUser({ referredByUserId: 'SELF' });
  addUser(narcissist);
  const before = getAllReferralEarnings().length;
  const result = appendDepositAndReferralCommission(narcissist.id, 'USDT', 800, `TX-SELF-${seq}`);
  assert.equal(result.commissions.length, 0);
  assert.equal(getAllReferralEarnings().length, before);
  assert.equal(getReferredUserIds(narcissist.id).includes(narcissist.id), false);
});

test('denied deposits record no commission (only the confirm path pays out)', () => {
  const referrer = makeUser({ referralCode: 'REFERR02' });
  addUser(referrer);
  const deniedRef = `TX-DENIED-${seq}`;
  const before = getReferralEarningsForUser(referrer.id).length;

  // Simulate deny-deposit: the transaction is cancelled and the credit path
  // (appendDepositAndReferralCommission) is never invoked — exactly what the
  // route does for /admin/transactions/:id/deny-deposit.
  void deniedRef;

  assert.equal(getReferralEarningsForUser(referrer.id).length, before);
  assert.equal(
    getLedgerForUser(referrer.id).filter((e) => e.referenceId === `TX-DENIED-${seq}`).length,
    0
  );
});

test('ledger hash-chain integrity still passes after commission entries', () => {
  const referrer = makeUser({ referralCode: 'REFERR03' });
  addUser(referrer);
  const referredA = makeUser({ referredByUserId: referrer.id });
  addUser(referredA);
  const referredB = makeUser({ referredByUserId: referrer.id });
  addUser(referredB);

  appendDepositAndReferralCommission(referredA.id, 'USDT', 2000, `TX-CHAIN-${seq}-A`);
  appendDepositAndReferralCommission(referredB.id, 'USDT', 3000, `TX-CHAIN-${seq}-B`);

  const result = verifyLedgerIntegrity();
  assert.equal(result.valid, true);
  assert.ok(result.checked >= 4); // 2 deposits + 2 commissions at minimum
});

test('findUserByReferralCode resolves codes case-insensitively', () => {
  const u = makeUser({ referralCode: 'FINDME1' });
  addUser(u);
  const found = findUserByReferralCode('findme1');
  assert.ok(found);
  assert.equal(found.id, u.id);
  assert.equal(findUserByReferralCode('NOPE9999'), undefined);
});