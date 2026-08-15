/* @ts-nocheck */
/**
 * Test the full Docker stack through the frontend proxy (port 3000).
 * Run with: npx tsx src/test-docker.ts
 */
const BASE = 'http://localhost:3000/api';

async function request(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log('=== GDPTraders Docker Stack Test (via frontend proxy) ===\n');

  // 1. Health check through frontend proxy
  const health = await request('/health');
  console.log(`[1] Health via proxy: ${health.status}`, health.body.status, `| db: ${health.body.db}`);

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

  // 4. Get transactions
  const txns = await request('/portfolio/transactions', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[4] Transactions: ${txns.status}`, `${txns.body.length} transactions`);

  // 5. Get wallet addresses
  const addresses = await request('/wallet/addresses', {
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  console.log(`[5] Wallet Addresses: ${addresses.status}`, `${addresses.body.length} addresses`);

  // 6. Login as admin
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@gdptraders.io',
      password: 'AdminPass123!',
    }),
  });
  console.log(`[6] Admin Login: ${adminLogin.status}`, adminLogin.body.user?.role);
  const adminToken = adminLogin.body.token;

  // 7. Verify ledger integrity
  const integrity = await request('/admin/ledger/verify', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`[7] Ledger Integrity: ${integrity.status}`, `valid=${integrity.body.valid}, entries=${integrity.body.checked}`);

  // 8. Get admin stats
  const stats = await request('/admin/stats', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`[8] Admin Stats: ${stats.status}`, JSON.stringify(stats.body));

  // 9. Get strategies
  const strategies = await request('/strategies');
  console.log(`[9] Strategies: ${strategies.status}`, `${strategies.body.length} products`);

  console.log('\n=== All Docker stack tests passed ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});