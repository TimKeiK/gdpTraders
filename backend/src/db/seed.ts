import bcrypt from 'bcryptjs';
import { addUser, type User } from './index.js';

/**
 * Seeds a CLEAN database: staff portal accounts only.
 *
 * No client accounts, no transactions, no ledger entries, no allocations,
 * no performance series, no audit logs — every client-facing dataset starts
 * empty so production data is never polluted with demo records.
 */
export async function seedDatabase(): Promise<void> {
  console.log('Seeding database (staff accounts only)...');

  const createdAt = new Date().toISOString();

<<<<<<< HEAD
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
=======
  const staffUsers: User[] = [
    {
      id: 'user_admin_001',
      email: 'admin@gdptraders.io',
      passwordHash: await bcrypt.hash('gdpAdmin#', 12),
      name: 'System Admin',
      role: 'admin',
      kycStatus: 'APPROVED',
      ipWhitelist: [],
      withdrawalCap: 0,
      createdAt,
    },
    {
      id: 'user_compliance_001',
      email: 'compliance@gdptraders.io',
      passwordHash: await bcrypt.hash('gdpCompliance#', 12),
      name: 'Compliance Officer',
      role: 'compliance',
      kycStatus: 'APPROVED',
      ipWhitelist: [],
      withdrawalCap: 0,
      createdAt,
    },
>>>>>>> 198d249b3b891883c4f3f576bb65bb415acd0581
  ];

  for (const u of staffUsers) {
    await addUser(u);
  }

  console.log('Database seeded successfully.');
  console.log('Staff credentials:');
  console.log('  Admin:       admin@gdptraders.io / gdpAdmin#');
  console.log('  Compliance:  compliance@gdptraders.io / gdpCompliance#');
}

// Run seed directly when executed
if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}

