// backend/src/lib/email.ts
import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Create the Resend client lazily. When no RESEND_API_KEY is configured the
// app still boots and `sendVerificationEmail` degrades to a logged no-op —
// mirroring how the Stripe deposit flow runs in MOCK mode without a key.
const apiKey = process.env.RESEND_API_KEY?.trim();
export const resend: Resend | null = apiKey ? new Resend(apiKey) : null;

interface SendVerificationEmailParams {
  to: string;
  username?: string;
  verificationLink: string;
}

export async function sendVerificationEmail({
  to,
  username,
  verificationLink,
}: SendVerificationEmailParams) {
  // No Resend API key configured — emit a verification link to the console so
  // signup still works in local / mock deployments.
  if (!resend) {
    console.log(
      `[email] No RESEND_API_KEY configured; skipping send to ${to}.\n` +
        `  Verification link: ${verificationLink}`
    );
    return undefined;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'GDPTraders <onboarding@resend.dev>',
      to: [to],
      subject: 'Verify your email address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #F5C518;">GDPTraders</h1>
          <p>Hi ${username || 'there'},</p>
          <p>Thanks for signing up! Please verify your email address by clicking the button below:</p>
          <a href="${verificationLink}" style="display: inline-block; background: #F5C518; color: #050510; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify Email</a>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${verificationLink}">${verificationLink}</a></p>
          <p>This link expires in 24 hours.</p>
          <p>— The GDPTraders Team</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      throw new Error('Failed to send verification email');
    }

    console.log(`Verification email sent to ${to} (ID: ${data?.id})`);
    return data;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}