/// <reference types="node" />
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

  // 2. Login as admin (matches the staff account seeded by src/db/seed.ts)
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: 'admin@gdptraders.io',
      password: 'gdpAdmin#',
    }),
  });
  console.log(`[2] Admin Login: ${adminLogin.status}`, adminLogin.body.user?.email, `| role: ${adminLogin.body.user?.role}`);
  const adminToken = adminLogin.body.token;

  // 3. Verify ledger integrity
  const integrity = await request('/admin/ledger/verify', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`[3] Ledger Integrity: ${integrity.status}`, `valid=${integrity.body.valid}, entries=${integrity.body.checked}`);

  // 4. Get admin stats
  const stats = await request('/admin/stats', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`[4] Admin Stats: ${stats.status}`, JSON.stringify(stats.body));

  // 5. Get strategies (public)
  const strategies = await request('/strategies');
  console.log(`[5] Strategies: ${strategies.status}`, `${strategies.body.length} products`);

  console.log('\n=== All Docker stack tests passed ===');
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});