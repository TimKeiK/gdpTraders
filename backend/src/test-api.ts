/* @ts-nocheck */
/**
 * Quick API smoke test for the GDPTraders backend.
 * Run with: npx tsx src/test-api.ts
 */

const BASE = 'http://localhost:8000/api';

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log('=== GDPTraders Backend API Test ===\n');

  // 1. Health check
  const health = await request('/health');
  console.log(`[1] Health: ${health.status}`, health.body.status);

  // 2. Login as demo client
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'demo@gdptraders.io',
      password: 'DemoPass123!',
    }),
  });
  console.log(`[2] Login: ${login.status}`, login.body.user?.email);
  const clientToken = login.body.token;

  // 3. Get portfolio summary
  const summary = await request('/portfolio/summary', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[3] Portfolio Summary: ${summary.status}`, `Total: $${summary.body.totalValue}`);

  // 4. Get allocations
  const allocations = await request('/portfolio/allocations', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[4] Allocations: ${allocations.status}`, `${allocations.body.length} strategies`);

  // 5. Get performance
  const perf = await request('/portfolio/performance?days=30', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[5] Performance: ${perf.status}`, `${perf.body.length} data points`);

  // 6. Get transactions
  const txns = await request('/portfolio/transactions', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[6] Transactions: ${txns.status}`, `${txns.body.length} transactions`);

  // 7. Get wallet addresses
  const addresses = await request('/wallet/addresses', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[7] Wallet Addresses: ${addresses.status}`, `${addresses.body.length} addresses`);

  // 8. Get withdrawal policy
  const policy = await request('/wallet/policy', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[8] Withdrawal Policy: ${policy.status}`, policy.body.processingTimeCrypto);

  // 9. Get KYC status
  const kyc = await request('/kyc/status', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[9] KYC Status: ${kyc.status}`, kyc.body.status);

  // 10. Get strategies (public)
  const strategies = await request('/strategies', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[10] Strategies: ${strategies.status}`, `${strategies.body.length} products`);

  // 11. Login as admin
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@gdptraders.io',
      password: 'AdminPass123!',
    }),
  });
  console.log(`[11] Admin Login: ${adminLogin.status}`, adminLogin.body.user?.role);
  const adminToken = adminLogin.body.token;

  // 12. Verify ledger integrity (admin)
  const integrity = await request('/admin/ledger/verify', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`[12] Ledger Integrity: ${integrity.status}`, `valid=${integrity.body.valid}, entries=${integrity.body.checked}`);

  // 13. Get admin stats
  const stats = await request('/admin/stats', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`[13] Admin Stats: ${stats.status}`, JSON.stringify(stats.body));

  // 14. Get audit logs
  const audit = await request('/admin/audit-logs', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`[14] Audit Logs: ${audit.status}`, `${audit.body.length} entries`);

  // 15. Create a withdrawal request (client)
  const withdraw = await request('/wallet/withdraw', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clientToken}` },
    body: JSON.stringify({
      asset: 'USDC',
      amount: 10000,
      destinationAddress: '0xTestDestination123',
    }),
  });
  console.log(`[15] Withdrawal Request: ${withdraw.status}`, withdraw.body.message);

  // 16. Approve withdrawal as admin
  const withdrawId = withdraw.body.transaction?.id;
  if (withdrawId) {
    const approve1 = await request(`/wallet/withdrawals/${withdrawId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(`[16] Admin Approval: ${approve1.status}`, approve1.body.message);

    // 17. Login as compliance and approve
    const compLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'compliance@gdptraders.io',
        password: 'CompliancePass123!',
      }),
    });
    const compToken = compLogin.body.token;

    const approve2 = await request(`/wallet/withdrawals/${withdrawId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${compToken}` },
    });
    console.log(`[17] Compliance Approval: ${approve2.status}`, approve2.body.message);
  }

  // 18. Verify ledger integrity after withdrawal
  const integrity2 = await request('/admin/ledger/verify', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`[18] Ledger Integrity (after): ${integrity2.status}`, `valid=${integrity2.body.valid}, entries=${integrity2.body.checked}`);

  console.log('\n=== All tests completed ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});