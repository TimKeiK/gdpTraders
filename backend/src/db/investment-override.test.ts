import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addUser,
  addInvestment,
  updateInvestment,
  getActiveInvestmentForUser,
  type User,
  type Investment,
} from './database.js';
import { getPlanByName } from '../data/plans.js';

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

test('getPlanByName resolves plans case-insensitively and rejects unknown', () => {
  assert.equal(getPlanByName('bronze')?.name, 'Bronze');
  assert.equal(getPlanByName('Silver')?.name, 'Silver');
  assert.equal(getPlanByName('Rhodium')?.dailyRate, 20);
  assert.equal(getPlanByName('DIAMOND')?.name, 'Diamond');
  assert.equal(getPlanByName('Platinum'), null);
});

test('admin investment-plan override updates the active plan and is served back', () => {
  const u = makeUser();
  addUser(u);

  // The deposit-assignment logic (recordInvestmentForDeposit) writes an active
  // plan WITHOUT the override flag.
  const base: Investment = {
    id: 'INV-TEST-1',
    userId: u.id,
    initialDeposit: 500,
    assignedPlan: 'Silver',
    dailyRate: 5,
    durationDays: 100,
    startDate: new Date().toISOString(),
    endDate: null,
    totalExpectedReturn: 3000,
    status: 'active',
  };
  addInvestment(base);
  assert.equal(getActiveInvestmentForUser(u.id)?.planOverride, undefined);

  // Admin manually upgrades this client straight to Rhodium (planOverride=true).
  updateInvestment({
    ...base,
    assignedPlan: 'Rhodium',
    dailyRate: 20,
    durationDays: 250,
    planOverride: true,
  });

  const active = getActiveInvestmentForUser(u.id);
  assert.equal(active?.assignedPlan, 'Rhodium');
  assert.equal(active?.dailyRate, 20);
  assert.equal(active?.durationDays, 250);
  assert.equal(active?.planOverride, true);
});

test('admin override creates a new active plan when the client has none', () => {
  const u = makeUser();
  addUser(u);

  const startDate = new Date().toISOString();
  addInvestment({
    id: 'INV-TEST-2',
    userId: u.id,
    initialDeposit: 1500,
    assignedPlan: 'Diamond',
    dailyRate: 7,
    durationDays: 150,
    startDate,
    endDate: null,
    totalExpectedReturn: 17250,
    status: 'active',
    planOverride: true,
  });

  const active = getActiveInvestmentForUser(u.id);
  assert.equal(active?.assignedPlan, 'Diamond');
  assert.equal(active?.planOverride, true);
  assert.equal(active?.initialDeposit, 1500);
});