import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById, type User } from '../db/index.js';
import { config } from '../config.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
  userId?: string;
  userRole?: string;
}

const JWT_SECRET = config.jwtSecret;

export function generateToken(user: User): string {
  const expiresIn = config.jwtExpiresIn as jwt.SignOptions['expiresIn'];
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn }
  );
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = await findUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    req.user = user;
    req.userId = user.id;
    req.userRole = user.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/** Critical rule from backend.md: no deposits accepted until KYC is APPROVED */
export function requireKycApproved(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (req.user && req.user.kycStatus !== 'APPROVED') {
    res.status(403).json({
      error: 'KYC verification required',
      kycStatus: req.user.kycStatus,
    });
    return;
  }
  next();
}