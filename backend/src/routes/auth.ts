// backend/src/routes/auth.ts
import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import {
  addUser,
  removeUser,
  findUserByEmail,
  findUserById,
  setEmailVerified,
  addAuditLog,
  type User,
} from '../db/index.js';
import { generateToken, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { sendVerificationEmail } from '../lib/email.js';
import { config } from '../config.js';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const JWT_SECRET = config.jwtSecret;
const FRONTEND_URL = config.frontendUrl;

/**
 * POST /api/auth/register
 */
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password, and name are required' });
    return;
  }
  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Please provide a valid email address' });
    return;
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (await findUserByEmail(normalizedEmail)) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = `user_${nanoid(10)}`;

    const verificationToken = jwt.sign(
      { userId, email: normalizedEmail, purpose: 'email_verification' },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    const verificationLink = `${FRONTEND_URL}/verify-email?token=${verificationToken}`;

    // Persist first so the account always exists before any email goes out.
    const user: User = {
      id: userId,
      email: normalizedEmail,
      passwordHash,
      name,
      role: 'client',
      kycStatus: 'PENDING',
      ipWhitelist: [],
      withdrawalCap: 100000,
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      createdAt: new Date().toISOString(),
    };
    await addUser(user);

    // Send the email, but never fail the registration because of it — the
    // account is already persisted and can be verified later (resend flow).
    let emailSent = true;
    try {
      await sendVerificationEmail({
        to: normalizedEmail,
        username: name,
        verificationLink,
      });
    } catch (emailError) {
      emailSent = false;
      console.error(
        `[register] Verification email could not be sent to ${normalizedEmail}. ` +
          `Account created anyway; verification link: ${verificationLink}`,
        emailError
      );
    }

    await addAuditLog(user.id, 'ACCOUNT_CREATED', `User registered with email ${user.email}`);

    res.status(201).json({
      message: emailSent
        ? 'Registered. Please check your email to verify your account before logging in.'
        : 'Registered, but the verification email could not be sent. Please contact support to verify your account.',
      emailSent,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        kycStatus: user.kycStatus,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to complete registration. Please try again.' });
  }
});

/**
 * GET /api/auth/verify-email
 */
router.get('/verify-email', async (req: Request, res: Response) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      email: string;
      purpose: string;
    };

    if (decoded.purpose !== 'email_verification') {
      res.status(400).json({ error: 'Invalid token type' });
      return;
    }

    const user = await findUserById(decoded.userId);
    if (!user || user.email !== decoded.email) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.isEmailVerified) {
      res.status(200).json({ message: 'Email already verified' });
      return;
    }

    await setEmailVerified(user.id);
    await addAuditLog(user.id, 'EMAIL_VERIFIED', 'Email address verified');

    res.status(200).json({ message: 'Email verified successfully! You can now log in.' });
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(400).json({ error: 'Verification link has expired. Please request a new one.' });
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(400).json({ error: 'This verification link is invalid. Please use the link from your verification email, or sign up again to receive a new one.' });
      return;
    }
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Something went wrong while verifying your email. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await findUserByEmail(email.trim().toLowerCase());
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

  if (!user.isEmailVerified) {
    res.status(403).json({ error: 'Please verify your email before logging in' });
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