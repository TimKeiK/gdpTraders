/// <reference types="node" />
/**
 * Quick API smoke test for the GDPTraders backend.
 *
 * Covers health, auth, portfolio, KYC, card deposits (create + confirm +
 * portfolio reflection), multi-sig withdrawals, and ledger integrity.
 *
 * Run with: npx tsx src/test-api.ts   (after starting the backend on :8000)
 */
const BASE = 'http://localhost:8000/api';

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...((options.headers as Record<string, string>) || {}) },
  });
  const body = await res.json();
  return { status: res.status, body };
}

/** Fails loudly if the response status is not as expected. */
function expectStatus(res: { status: number; body: any }, expected: number, label: string): any {
  if (res.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, got ${res.status} — ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function login(email: string, password: string): Promise<string> {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const body = expectStatus(res, 200, `Login ${email}`);
  return body.token as string;
}

async function main() {
  console.log('=== GDPTraders Backend API Test ===\n');

  // 1. Health check
  expectStatus(await request('/health'), 200, 'Health');
  console.log('[1] Health OK');

  // 2. Auth
  const clientToken = await login('demo@gdptraders.io', 'DemoPass123!');
  const adminToken = await login('admin@gdptraders.io', 'AdminPass123!');
  const compToken = await login('compliance@gdptraders.io', 'CompliancePass123!');
  console.log('[2] Login OK (client / admin / compliance)');

  const headers = { Authorization: `Bearer ${clientToken}` };

  // 3. Portfolio summary (baseline)
  const before = expectStatus(await request('/portfolio/summary', { headers }), 200, 'Summary');
  console.log(`[3] Portfolio Summary OK — Total: $${before.totalValue}`);

  // 4. Strategy allocations
  const allocs = expectStatus(await request('/portfolio/allocations', { headers }), 200, 'Allocations');
  console.log(`[4] Allocations OK — ${allocs.length} strategies`);

  // 5. Performance series
  const perf = expectStatus(await request('/portfolio/performance?days=30', { headers }), 200, 'Performance');
  console.log(`[5] Performance OK — ${perf.length} data points`);

  // 6. Transaction history
  const txnList = expectStatus(await request('/portfolio/transactions', { headers }), 200, 'Transactions') as any[];
  console.log(`[6] Transactions OK — ${txnList.length} transactions`);

  // 7. Wallet addresses — every listed asset must have a constant deposit wallet
  const addrs = expectStatus(await request('/wallet/addresses', { headers }), 200, 'Wallet addresses') as any[];
  const missing = addrs.filter((a) => !a.address).map((a) => a.asset);
  if (missing.length > 0) throw new Error(`Deposit wallets missing for: ${missing.join(', ')}`);
  console.log(`[7] Wallet Addresses OK — ${addrs.length} assets, all with wallets`);

  // 8. Withdrawal policy
  expectStatus(await request('/wallet/policy', { headers }), 200, 'Policy');
  console.log('[8] Withdrawal Policy OK');

  // 9. KYC status
  const kyc = expectStatus(await request('/kyc/status', { headers }), 200, 'KYC') as any;
  console.log(`[9] KYC Status OK — ${kyc.status}`);

  // 10. Strategies (public)
  const strategies = expectStatus(await request('/strategies', { headers }), 200, 'Strategies') as any[];
  console.log(`[10] Strategies OK — ${strategies.length} products`);

  // 11. Ledger integrity (before activity)
  const integ1 = expectStatus(
    await request('/admin/ledger/verify', { headers: { Authorization: `Bearer ${adminToken}` } }),
    200,
    'Ledger integrity',
  );
  if (!integ1.valid) throw new Error('Ledger integrity is INVALID before test activity');
  console.log(`[11] Ledger Integrity OK — valid, ${integ1.checked} entries`);
// 12. Admin stats & 13. audit logs
  const stats = expectStatus(await request('/admin/stats', { headers: { Authorization: `Bearer ${adminToken}` } }), 200, 'Admin stats');
  const audit = expectStatus(await request('/admin/audit-logs', { headers: { Authorization: `Bearer ${adminToken}` } }), 200, 'Audit logs') as any[];
  console.log(`[12] Admin Stats OK — users=${stats.users}, ledger entries=${stats.ledgerEntries}`);
  console.log(`[13] Audit Logs OK — ${audit.length} entries`);

  // 14-16. Card deposit flow -> constant custodial wallet
  const depositAmount = 500;
  const intent = expectStatus(
    await request('/wallet/deposit', { method: 'POST', headers, body: JSON.stringify({ asset: 'USDT', amount: depositAmount }) }),
    201,
    'Create deposit intent',
  );
  console.log(`[14] Deposit intent OK — ${intent.paymentIntentId} -> wallet ${intent.depositAddress}`);

  const confirmed = expectStatus(
    await request('/wallet/deposit-confirm', {
      method: 'POST',
      headers,
      body: JSON.stringify({ paymentIntentId: intent.paymentIntentId, asset: intent.asset, amount: intent.amount }),
    }),
    201,
    'Confirm deposit',
  );
  console.log(`[15] Deposit confirmed OK — tx ${confirmed.transaction.id}`);

  // 15b. The completed deposit must be reflected in the portfolio.
  const after = expectStatus(await request('/portfolio/summary', { headers }), 200, 'Summary (after deposit)');
  const expected = before.totalValue + depositAmount;
  if (Math.abs(after.totalValue - expected) > 0.01) {
    throw new Error(`Portfolio did not reflect deposit: expected ~$${expected}, got $${after.totalValue}`);
  }
  console.log(`[16] Portfolio reflects deposit OK — $${before.totalValue} -> $${after.totalValue}`);

  // 17. Withdrawal request (client)
  const withdraw = expectStatus(
    await request('/wallet/withdraw', {
      method: 'POST',
      headers,
      body: JSON.stringify({ asset: 'USDT', amount: 10000, destinationAddress: '0xTestDestination123' }),
    }),
    201,
    'Withdrawal request',
  );
  console.log(`[17] Withdrawal request OK — ${withdraw.transaction.id}`);

  // 18-19. Multi-sig approval (admin then compliance)
  const wId = withdraw.transaction.id as string;
  const approve1 = expectStatus(
    await request(`/wallet/withdrawals/${wId}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` } }),
    200,
    'Admin approval',
  );
  console.log(`[18] Admin approval OK — ${approve1.message}`);
  const approve2 = expectStatus(
    await request(`/wallet/withdrawals/${wId}/approve`, { method: 'POST', headers: { Authorization: `Bearer ${compToken}` } }),
    200,
    'Compliance approval',
  );
  console.log(`[19] Compliance approval OK — ${approve2.message}`);

  // 20. Ledger integrity after deposit + withdrawal
  const integ2 = expectStatus(
    await request('/admin/ledger/verify', { headers: { Authorization: `Bearer ${adminToken}` } }),
    200,
    'Ledger integrity (after)',
  );
  if (!integ2.valid) throw new Error('Ledger integrity INVALID after test activity');
  console.log(`[20] Ledger Integrity (after) OK — valid=${integ2.valid}, ${integ2.checked} entries`);

  console.log('\n=== All tests completed successfully ===');
}

main().catch((err) => {
  console.error('\nTest FAILED:', err);
  process.exit(1);
});