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

