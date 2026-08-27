import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { seedDatabase } from './db/seed.js';
import { dbMode, ensureSchema } from './db/index.js';
import { pool } from './db/pgStore.js';

import authRoutes from './routes/auth.js';
import portfolioRoutes from './routes/portfolio.js';
import kycRoutes from './routes/kyc.js';
import walletRoutes from './routes/wallet.js';
import adminRoutes from './routes/admin.js';
import strategiesRoutes from './routes/strategies.js';

const app = express();
const PORT = parseInt(process.env.PORT || '8000', 10);

// ---------- Security middleware (backend.md §5) ----------
app.use(helmet()); // Security headers, TLS-friendly defaults
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:80'] }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Simple rate limiting (backend.md §5.1: daily withdrawal caps, IP protections)
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
app.use((req: Request, res: Response, next) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip) ?? { count: 0, resetAt: now + 60_000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60_000;
  }
  bucket.count++;
  rateBuckets.set(ip, bucket);
  if (bucket.count > 120) {
    res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    return;
  }
  next();
});

// ---------- Health check (public, no auth) ----------
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'gdptraders-backend',
    version: '1.0.0',
    db: dbMode,
    time: new Date().toISOString(),
  });
});

// ---------- Routes ----------
app.use('/api/auth', authRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/admin', adminRoutes); // /api/admin/*
app.use('/api/strategies', strategiesRoutes); // Public strategy products

// ---------- 404 ----------
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------- Error handler ----------
app.use((err: Error, _req: Request, res: Response) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------- Database connection retry (backoff) ----------
async function waitForDatabase(maxRetries = 30, delayMs = 2000): Promise<void> {
  if (dbMode !== 'postgresql') return;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Try a simple query to verify connection
      await pool.query('SELECT 1');
      console.log(`[database] PostgreSQL connection established (attempt ${attempt})`);
      return;
    } catch (err) {
      if (attempt === maxRetries) {
        console.error(`[database] Failed to connect after ${maxRetries} attempts`);
        throw err;
      }
      console.log(`[database] Waiting for PostgreSQL... (attempt ${attempt}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// ---------- Start ----------
async function start() {
  try {
    console.log(`[database] Mode: ${dbMode}`);
    await waitForDatabase();

    // Self-heal any schema drift (e.g. columns added after the DB volume
    // was first created) before the app or seeder touches the tables.
    await ensureSchema();
    console.log('[database] Schema migrations applied');

    await seedDatabase();
    app.listen(PORT, () => {
      console.log(`┌─────────────────────────────────────────────┐`);
      console.log(`│   GDPTraders Backend v1.0.0                │`);
      console.log(`│   Listening on http://localhost:${PORT}          │`);
      console.log(`│   API base: http://localhost:${PORT}/api       │`);
      console.log(`│   Database: ${dbMode}                          │`);
      console.log(`└─────────────────────────────────────────────┘`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();