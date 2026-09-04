/**
 * Referral-program helpers shared by the in-memory and PostgreSQL stores,
 * the auth/registration flow, and the referral routes.
 *
 * Pure functions only — no DB access in this file, so tests can drive them
 * without touching a database. Store-level uniqueness checking lives in
 * the store (generateUniqueReferralCode).
 */
import { randomBytes } from 'crypto';

/** Commission paid to a referrer on each confirmed deposit: 5% of the actual credited amount. */
export const REFERRAL_COMMISSION_RATE = 0.05;

export const REFERRAL_CODE_ALPHABET ='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const REFERRAL_CODE_LENGTH = 8;

/**
 * Generates an 8-character uppercase-alphanumeric referral code
 * (e.g. "AB12CD34") from a CSPRNG. Uniqueness is enforced by the caller
 * (store-level generateUniqueReferralCode), not here.
 */
export function generateCode(): string {
  const alphabet = REFERRAL_CODE_ALPHABET;
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let out ='';
  for (let i =0; i < REFERRAL_CODE_LENGTH; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** 5% of a confirmed deposit amount, rounded to 8 decimal places. */
export function computeReferralCommission(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const factor = 100000000; // 1e8 — 8 decimal places
  return Math.round(amount * REFERRAL_COMMISSION_RATE * factor) / factor;
}

/** Masks a full name for client-facing don't-surfacing, e.g. "Jane Doe" → "J. D." */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length ===0) return '—';
  return parts.map((p) => `${p[0]}.`).join(' ');
}

/** Masks an email for client-facing don't-surfacing, e.g. "jane@example.com" → "j***@e***.com". */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <=0) return '—';
   const local = email.slice(0, at);
  const domain = email.slice(at + 1);
   const localMask = `${local[0]}***`;
   const dot = domain.indexOf('.');
   const domainMask = dot > 0 ? `${domain[0]}***${domain.slice(dot)}` : `${domain[0]}***`;
   return `${localMask}@${domainMask}`;
}

/** Builds the shareable, public signup link for a referral code. */
export function buildReferralLink(frontendUrl: string, code: string): string {
  return `${frontendUrl}/signup?ref=${encodeURIComponent(code)}`;
}