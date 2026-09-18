/**
 * Pure money-math tests for profit reinvestment — no database involved.
 * The reinvestment moves profit from the withdrawable balance into capital, so
 * the same money must never be spendable twice.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  availableProfit,
  uncommittedWithdrawable,
  reinvestableAmount,
  pendingReinvestReserved,
  committedReinvestTotal,
  completedReinvestIds,
  isReinvestMove,
} from './reinvest.js';

test('availableProfit subtracts losses and profit already committed to capital', () => {
  assert.equal(availableProfit({ profit: 1000, loss: 0, reinvested: 0 }), 1000);
  assert.equal(availableProfit({ profit: 1000, loss: 200, reinvested: 0 }), 800);
  // Completed + pending reinvestments both consume the profit.
  assert.equal(availableProfit({ profit: 1000, loss: 200, reinvested: 300 }), 500);
  // Never negative — a client cannot owe profit.
  assert.equal(availableProfit({ profit: 100, loss: 0, reinvested: 500 }), 0);
});

test('pending reinvestment requests reserve the withdrawable balance', () => {
  const txs = [
    { type: 'Reinvest', status: 'Processing', amount: 300 },
    { type: 'Reinvest', status: 'Completed', amount: 100 },
    { type: 'Reinvest', status: 'Cancelled', amount: 999 },
    { type: 'Withdrawal', status: 'Pending', amount: 5000 },
  ];
  // Only Processing requests hold money that has not left the balance yet.
  assert.equal(pendingReinvestReserved(txs), 300);
  // Cancelled requests release their reservation.
  assert.equal(committedReinvestTotal(txs), 400);
  assert.equal(uncommittedWithdrawable({ availableWithdrawal: 500, reservedForReinvest: 300 }), 200);
  assert.equal(uncommittedWithdrawable({ availableWithdrawal: 100, reservedForReinvest: 300 }), 0);
});

test('a client can never withdraw and reinvest the same balance (double-dip)', () => {
  // The available withdrawal IS the single spendable bucket for BOTH actions.
  // Client has 500 available, then WITHDRAWS all 500 → the bucket is 0.
  const availableWithdrawal = 0; // already withdrawn

  const reinvestableNow = reinvestableAmount({ availableWithdrawal });
  assert.equal(reinvestableNow, 0, 'an emptied balance must not stay reinvestable');

  // With the balance intact the whole 500 is reinvestable.
  assert.equal(reinvestableAmount({ availableWithdrawal: 500 }), 500);

  // Whichever action runs first, the bucket is drawn down — spending it twice is
  // structurally impossible because both caps read the SAME number.
  const afterReinvest = reinvestableAmount({ availableWithdrawal: 500 - 500 });
  assert.equal(afterReinvest, 0);
});

test('reinvestableAmount equals the available withdrawal (one number for both actions)', () => {
  // Whatever the admin/accrual engine set as withdrawable is also reinvestable,
  // so the deposit section and the withdrawal flow always agree.
  assert.equal(reinvestableAmount({ availableWithdrawal: 150 }), 150);
  assert.equal(reinvestableAmount({ availableWithdrawal: 0 }), 0);
  assert.equal(reinvestableAmount({ availableWithdrawal: 1234.56 }), 1234.56);

  // A pending request reserves its share so it cannot be offered twice.
  assert.equal(
    reinvestableAmount({ availableWithdrawal: 600, reservedForReinvest: 300 }),
    300,
  );
  // Never negative when a reservation exceeds the balance.
  assert.equal(
    reinvestableAmount({ availableWithdrawal: 100, reservedForReinvest: 300 }),
    0,
  );
});

test('ledger entries from a confirmed reinvestment are bucket moves, not P&L', () => {
  const txs = [
    { id: 'RX-100001', type: 'Reinvest', status: 'Completed', amount: 250 },
    { id: 'RX-100002', type: 'Reinvest', status: 'Processing', amount: 50 },
    { id: 'TX-1', type: 'Deposit', status: 'Completed', amount: 1000 },
  ];
  const ids = completedReinvestIds(txs as never);
  assert.deepEqual([...ids], ['RX-100001']);

  // The pair a reinvestment writes: +deposit (cost basis) and −trade (offset).
  assert.equal(isReinvestMove({ entryType: 'deposit', amount: 250, referenceId: 'RX-100001' }, ids), true);
  assert.equal(isReinvestMove({ entryType: 'trade', amount: -250, referenceId: 'RX-100001' }, ids), true);
  // Pending reinvestments have not written ledger entries yet.
  assert.equal(isReinvestMove({ entryType: 'trade', amount: -50, referenceId: 'RX-100002' }, ids), false);
  // Real profit/loss entries are never treated as bucket moves.
  assert.equal(isReinvestMove({ entryType: 'profit', amount: 25, referenceId: 'ACC-2026-09-18-ABC123' }, ids), false);
  assert.equal(isReinvestMove({ entryType: 'loss', amount: -10, referenceId: 'TX-1' }, ids), false);
  assert.equal(isReinvestMove({ entryType: 'trade', amount: -5 }, ids), false);
});
