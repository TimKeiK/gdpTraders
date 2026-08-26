import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bitcoin, Mail, KeyRound, User, ArrowRight, AlertCircle, LogIn } from 'lucide-react';
import { authApi } from '../../api/client';
import './SignUpPage.css';

export default function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Name, email, and password are all required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await authApi.register(email, password, name);
      authApi.logout();
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed. Please try again.');
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

        <h1 className="login-title">Create Your Account</h1>
        <p className="login-sub">
          New investor? Set up your client account to get started.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label><User size={14} /> Full Name</label>
            <input
              className="form-control"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              required
              disabled={loading}
            />
          </div>

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
            <input
              className="form-control"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label><KeyRound size={14} /> Confirm Password</label>
            <input
              className="form-control"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter your password"
              required
              disabled={loading}
            />
          </div>

          {error && (
            <p className="login-error">
              <AlertCircle size={14} /> {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            {loading ? 'Creating Account…' : 'Create Account'} <ArrowRight size={16} />
          </button>
        </form>

        <div className="login-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login"><LogIn size={12} style={{ verticalAlign: '-2px' }} /> Log in here</Link>
          </p>
          <p><Link to="/">Back to site</Link></p>
        </div>
      </div>
    </div>
  );
}