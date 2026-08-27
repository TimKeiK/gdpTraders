import bcrypt from 'bcryptjs';
import {
  addUser,
  addWallet,
  addDepositAddress,
  addTransaction,
  addAllocations,
  addPerformance,
  appendLedgerEntry,
  addAuditLog,
  type User,
  type Transaction,
} from './index.js';

// Deterministic pseudo-random walk for performance series
function buildPerformanceSeries(days: number) {
  const points: { date: string; portfolio: number; benchmark: number }[] = [];
  let portfolio = 100;
  let benchmark = 100;
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const pDelta = Math.sin(i * 0.7) * 0.9 + Math.cos(i * 0.23) * 0.5 + 0.12;
    const bDelta = Math.sin(i * 0.55) * 1.1 + Math.cos(i * 0.19) * 0.8 + 0.18;
    portfolio = portfolio * (1 + pDelta / 100);
    benchmark = benchmark * (1 + bDelta / 100);
    points.push({
      date: d.toISOString().slice(0, 10),
      portfolio: Math.round(portfolio * 100) / 100,
      benchmark: Math.round(benchmark * 100) / 100,
    });
  }
  return points;
}

export async function seedDatabase(): Promise<void> {
  console.log('Seeding database...');

  // Demo user matching the frontend mock data expectations
  const passwordHash = await bcrypt.hash('DemoPass123!', 12);

  const demoUser: User = {
    id: 'user_demo_001',
    email: 'demo@gdptraders.io',
    passwordHash,
    name: 'Demo Client',
    role: 'client',
    kycStatus: 'APPROVED',
    ipWhitelist: [],
    withdrawalCap: 100000,
    isEmailVerified: true,
    emailVerificationToken: null,
    createdAt: new Date().toISOString(),
  };
  await addUser(demoUser);

  // Admin & compliance users for multi-sig withdrawal approvals
  const adminHash = await bcrypt.hash('AdminPass123!', 12);
  await addUser({
    id: 'user_admin_001',
    email: 'admin@gdptraders.io',
    passwordHash: adminHash,
    name: 'System Admin',
    role: 'admin',
    kycStatus: 'APPROVED',
    ipWhitelist: [],
    withdrawalCap: 0,
    isEmailVerified: true,
    emailVerificationToken: null,
    createdAt: new Date().toISOString(),
  });

  const complianceHash = await bcrypt.hash('CompliancePass123!', 12);
  await addUser({
    id: 'user_compliance_001',
    email: 'compliance@gdptraders.io',
    passwordHash: complianceHash,
    name: 'Compliance Officer',
    role: 'compliance',
    kycStatus: 'APPROVED',
    ipWhitelist: [],
    withdrawalCap: 0,
    isEmailVerified: true,
    emailVerificationToken: null,
    createdAt: new Date().toISOString(),
  });

  // Wallets - layered custody per backend.md §4.3 (hot/warm/cold)
  const walletDefs = [
    { asset: 'BTC', address: 'bc1qdemo7x3k9f2j4m8p5q6r7s8t9u0v1w2x3y', type: 'cold' as const },
    { asset: 'ETH', address: '0x742d35Cc6634C0532925a3b844Bc5e2e3c7e2ab0d', type: 'cold' as const },
    { asset: 'USDC', address: '0x9f8e7d6c5b4a39281706f5e4d3c2b1a0f9e8d7c6', type: 'warm' as const },
    { asset: 'USDT', address: '0x129e77c2b9f8d4e5a6b7c8d9e0f1a2b3c4d5e6f7', type: 'warm' as const },
    { asset: 'SOL', address: 'DemoSolWallet7k9f2j4m8p5q6r7s8t9u0', type: 'hot' as const },
  ];

  for (const w of walletDefs) {
    await addWallet({
      id: `wallet_${demoUser.id}_${w.asset}`,
      userId: demoUser.id,
      asset: w.asset,
      address: w.address,
      walletType: w.type,
      createdAt: new Date().toISOString(),
    });
  }

  // Unique deposit addresses per user/asset (backend.md §4.3)
  const depositAssets = ['BTC', 'ETH', 'USDC', 'USDT', 'SOL'];
  for (const asset of depositAssets) {
    await addDepositAddress({
      address: `deposit_${asset}_demo_${Math.random().toString(16).slice(2, 34)}`,
      userId: demoUser.id,
      asset,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  }

  // Append-only ledger entries (immutable financial records)
  await appendLedgerEntry(demoUser.id, 'USDC', 250000, 'deposit', 'TX-98421');
  await appendLedgerEntry(demoUser.id, 'BTC', 120000, 'trade', 'TX-98390');
  await appendLedgerEntry(demoUser.id, 'ETH', 85000, 'trade', 'TX-98377');
  await appendLedgerEntry(demoUser.id, 'USDT', -50000, 'withdrawal', 'TX-98312');
  await appendLedgerEntry(demoUser.id, 'USD', -6875, 'fee', 'TX-98288');
  await appendLedgerEntry(demoUser.id, 'SOL', 230000, 'trade', 'TX-98240');
  await appendLedgerEntry(demoUser.id, 'BTC', 180000, 'trade', 'TX-98195');
  await appendLedgerEntry(demoUser.id, 'USDT', 400000, 'deposit', 'TX-98154');

  // Transactions matching the frontend's mock data
  const txns = [
    { id: 'TX-98421', date: '2026-08-01 14:32 UTC', type: 'Deposit', asset: 'USDC', amount: 250000, strategy: 'DeFi Treasury', status: 'Completed', txHash: '0x8f3a…c91d' },
    { id: 'TX-98390', date: '2026-07-29 09:15 UTC', type: 'Trade', asset: 'BTC', amount: 120000, strategy: 'BTC/ETH Core', status: 'Completed', txHash: '0x2b7e…44af' },
    { id: 'TX-98377', date: '2026-07-26 18:03 UTC', type: 'Trade', asset: 'ETH', amount: 85000, strategy: 'BTC/ETH Core', status: 'Completed', txHash: '0x91cc…08b2' },
    { id: 'TX-98312', date: '2026-07-22 11:47 UTC', type: 'Withdrawal', asset: 'USDT', amount: 50000, strategy: 'DeFi Treasury', status: 'Processing', txHash: '0x5e17…d3fa' },
    { id: 'TX-98288', date: '2026-07-18 16:29 UTC', type: 'Fee', asset: 'USD', amount: 6875, strategy: 'Management Fee (Monthly)', status: 'Completed', txHash: 'Internal Ledger' },
    { id: 'TX-98240', date: '2026-07-14 08:51 UTC', type: 'Trade', asset: 'SOL', amount: 230000, strategy: 'Active Quant', status: 'Completed', txHash: '0xf4a6…77e1' },
    { id: 'TX-98195', date: '2026-07-10 13:22 UTC', type: 'Trade', asset: 'BTC', amount: 180000, strategy: 'Arbitrage Alpha', status: 'Completed', txHash: '0x0b9d…a833' },
    { id: 'TX-98154', date: '2026-07-05 10:08 UTC', type: 'Deposit', asset: 'USDT', amount: 400000, strategy: 'Active Quant', status: 'Completed', txHash: '0x77cd…29fe' },
  ];

  for (const t of txns) {
    await addTransaction({ ...t, userId: demoUser.id, type: t.type as Transaction['type'], status: t.status as Transaction['status'] });
  }

  // Strategy allocations
  await addAllocations(demoUser.id, [
    { strategyId: 'btc-eth-core', strategyName: 'BTC/ETH Core', allocation: 425000, weight: 42.5, pnl24h: 1840 },
    { strategyId: 'arbitrage-alpha', strategyName: 'Arbitrage Alpha', allocation: 280000, weight: 28, pnl24h: 620 },
    { strategyId: 'defi-treasury', strategyName: 'DeFi Treasury', allocation: 195000, weight: 19.5, pnl24h: 245 },
    { strategyId: 'active-quant', strategyName: 'Active Quant', allocation: 100000, weight: 10, pnl24h: -380 },
  ]);

  // Performance series (90 days)
  await addPerformance(demoUser.id, buildPerformanceSeries(90));

  // Audit logs
  await addAuditLog(demoUser.id, 'ACCOUNT_CREATED', 'User registered with email demo@gdptraders.io');
  await addAuditLog(demoUser.id, 'KYC_APPROVED', 'KYC verification passed via provider');
  await addAuditLog(demoUser.id, 'DEPOSIT', 'USDC 250,000 credited to DeFi Treasury');
  await addAuditLog('user_admin_001', 'SECURITY_CHECK', 'Ledger integrity verified - all hashes valid');

  console.log('Database seeded successfully.');
  console.log('Demo credentials:');
  console.log('  Client:      demo@gdptraders.io / DemoPass123!');
  console.log('  Admin:       admin@gdptraders.io / AdminPass123!');
  console.log('  Compliance:  compliance@gdptraders.io / CompliancePass123!');
}

// Run seed directly when executed
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}