import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import {
  addUser,
  findUserByEmail,
  addAuditLog,
  type User,
} from '../db/index.js';
import { generateToken, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/register
 * Creates a new user. KYC status starts PENDING - no deposits until APPROVED.
 */
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password, and name are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }
  if (await findUserByEmail(email)) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user: User = {
    id: `user_${nanoid(10)}`,
    email: email.toLowerCase(),
    passwordHash,
    name,
    role: 'client',
    kycStatus: 'PENDING',
    ipWhitelist: [],
    withdrawalCap: 100000, // default daily cap
    createdAt: new Date().toISOString(),
  };

  await addUser(user);
  await addAuditLog(user.id, 'ACCOUNT_CREATED', `User registered with email ${user.email}`);

  const token = generateToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, kycStatus: user.kycStatus },
  });
});

/**
 * POST /api/auth/login
 * Verifies credentials and returns a JWT.
 */
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await addAuditLog(user.id, 'LOGIN_FAILED', 'Invalid password attempt');
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = generateToken(user);
  await addAuditLog(user.id, 'LOGIN_SUCCESS', 'Successful login');

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      kycStatus: user.kycStatus,
    },
  });
});

/**
 * GET /api/auth/profile
 * Returns the current user's profile.
 */
router.get('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    kycStatus: user.kycStatus,
    withdrawalCap: user.withdrawalCap,
    createdAt: user.createdAt,
  });
});

export default router;