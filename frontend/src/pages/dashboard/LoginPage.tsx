import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Bitcoin, Mail, KeyRound, ArrowRight, AlertCircle, CheckCircle, UserPlus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import PasswordInput from '../../components/PasswordInput';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);

  // Check if redirected from signup page
  const fromSignup = location.state as { registered?: boolean; needsVerification?: boolean } | null;
  const showSuccess = fromSignup?.registered;
  const needsVerification = fromSignup?.needsVerification;

  useEffect(() => {
    if (pendingRedirect && isAuthenticated) {
      navigate(pendingRedirect, { replace: true });
      setPendingRedirect(null);
    }
  }, [pendingRedirect, isAuthenticated, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password are both required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      const from = (location.state as { from?: string })?.from || '/dashboard';
      setPendingRedirect(from);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card card">
        <Link to="/" className="login-brand">
          <span className="login-logo"><Bitcoin size={24} /></span>
          <span>GDP<span className="login-accent">Traders</span></span>
        </Link>

        <h1 className="login-title">Login</h1>
        <p className="login-sub">
          Welcome back. Sign in to access your portfolio.
        </p>

        {showSuccess && (
          <p className="login-success">
            <CheckCircle size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {needsVerification
              ? 'Account created! Please check your email and click the verification link before signing in.'
              : 'Your account has been created! Please sign in with your new credentials.'}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label><Mail size={14} /> Email</label>
            <input
              className="form-control"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label><KeyRound size={14} /> Password</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="login-error">
              <AlertCircle size={14} /> {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? 'Signing In\u2026' : 'Sign In'} <ArrowRight size={16} />
          </button>
        </form>

        <div className="login-footer">
          <p>
            New to GDPTraders?{' '}
            <Link to="/signup"><UserPlus size={12} style={{ verticalAlign: '-2px' }} /> Create an account</Link>
          </p>
          <p><Link to="/">Back to site</Link></p>
        </div>
      </div>
    </div>
  );
}