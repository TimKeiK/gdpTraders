// frontend/src/pages/dashboard/VerifyEmailPage.tsx
import { useEffect, useState, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bitcoin, CheckCircle, XCircle, Loader2, LogIn } from 'lucide-react';
import './LoginPage.css';

type Status = 'verifying' | 'success' | 'already-verified' | 'error' | 'missing-token';

// Relative path — same as src/api/client.ts. On Vercel, /api/* is rewritten
// to the Render backend (vercel.json); in dev, vite.config.ts proxies it.
const API_BASE_URL = '/api';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (!token) {
      setStatus('missing-token');
      setMessage('No verification token was found in the link. Please use the link from your email.');
      return;
    }

    const controller = new AbortController();

    const verify = async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/auth/verify-email?token=${encodeURIComponent(token)}`,
          { signal: controller.signal }
        );
        const data = await res.json();

        if (!res.ok) {
          setStatus('error');
          setMessage(data?.error || 'Verification failed. The link may be invalid or expired.');
          return;
        }

        if (data?.message === 'Email already verified') {
          setStatus('already-verified');
        } else {
          setStatus('success');
        }
        setMessage(data?.message || 'Your email has been verified.');
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setStatus('error');
        setMessage('Could not reach the server. Please check your connection and try again.');
      }
    };

    verify();

    return () => controller.abort();
  }, [token]);

  return (
    <div className="login-page">
      <div className="login-card card">
        <Link to="/" className="login-brand">
          <span className="login-logo"><Bitcoin size={24} /></span>
          <span>GDP<span className="login-accent">Traders</span></span>
        </Link>

        <h1 className="login-title">Email Verification</h1>

        {status === 'verifying' && (
          <>
            <p className="login-sub">Verifying your email address, please wait…</p>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Loader2 size={32} className="spin" />
            </div>
          </>
        )}

        {(status === 'success' || status === 'already-verified') && (
          <>
            <p className="login-success">
              <CheckCircle size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {status === 'already-verified'
                ? 'This email has already been verified.'
                : 'Your email has been verified successfully!'}
            </p>
            <p className="login-sub">You can now sign in to your account.</p>
            <Link to="/login" className="btn btn-primary login-btn" style={{ marginTop: 16 }}>
              <LogIn size={16} /> Go to Sign In
            </Link>
          </>
        )}

        {(status === 'error' || status === 'missing-token') && (
          <>
            <p className="login-error">
              <XCircle size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {message}
            </p>
            <p className="login-sub">
              {status === 'missing-token'
                ? 'Please use the link from your verification email.'
                : 'If your link expired, you can request a new one by attempting to log in again.'}
            </p>
            <Link to="/login" className="btn btn-primary login-btn" style={{ marginTop: 16 }}>
              Back to Sign In
            </Link>
          </>
        )}

        <div className="login-footer">
          <p><Link to="/">Back to site</Link></p>
        </div>
      </div>
    </div>
  );
}