import { useEffect, useState } from 'react';
import { Copy, Check, AlertCircle, Gift, TrendingUp, Users } from 'lucide-react';
import { api, formatCurrency, type ReferralSummary } from '../../api/client';
import './DashboardPages.css';

const KYC_PILL: Record<string, string> = {
  APPROVED: 'pill-green',
  PENDING: 'pill-amber',
  SUBMITTED: 'pill-purple',
  REJECTED: 'pill-red',
};

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<ReferralSummary | null>(null);
  const [loadError, setLoadError] = useState('');
  const [copied, setCopied] = useState<'code' | 'link' | ''>('');

  useEffect(() => {
    let mounted = true;
    api
      .getReferrals()
      .then((r) => {
        if (mounted) {
          setReferrals(r);
          setLoadError('');
        }
      })
      .catch((err) => {
        if (mounted) setLoadError(err instanceof Error ? err.message : 'Failed to load referral data.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const copy = async (value: string, what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      // Clipboard unavailable — values remain visible for manual copy.
    }
  };

  return (
    <>
      <h1 className="dash-title">Referrals</h1>
      <p className="dash-last-updated">
        Share your link — earn 5% of every deposit your referred clients make.
      </p>

      {loadError && (
        <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          <AlertCircle size={14} /> {loadError}
        </p>
      )}

      {/* Referral code + shareable link */}
      <div className="card">
        <h2 className="dash-section-title">Your Referral Link</h2>
        {referrals?.referralCode ? (
          <>
            <div className="form-group">
              <label>Referral Code</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code className="mono" style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>
                  {referrals.referralCode}
                </code>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => copy(referrals.referralCode!, 'code')}
                  title="Copy referral code"
                >
                  {copied === 'code' ? <Check size={14} /> : <Copy size={14} />}
                  {copied === 'code' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Shareable Link</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <code className="mono" style={{ fontSize: 13, wordBreak: 'break-all' }}>
                  {referrals.referralLink}
                </code>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => copy(referrals.referralLink!, 'link')}
                  title="Copy referral link"
                >
                  {copied === 'link' ? <Check size={14} /> : <Copy size={14} />}
                  {copied === 'link' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--gray-400)' }}>No referral code available for your account.</p>
        )}
      </div>

      {/* Total earned */}
      <div className="dash-kpis mt-3">
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><Gift size={20} /></span>
          <span className="kpi-label">Total Earned</span>
          <strong className="kpi-value pos">{referrals ? formatCurrency(referrals.totalEarned) : '—'}</strong>
        </div>
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><Users size={20} /></span>
          <span className="kpi-label">Clients Referred</span>
          <strong className="kpi-value">{referrals ? referrals.referredClients.length : '—'}</strong>
        </div>
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><TrendingUp size={20} /></span>
          <span className="kpi-label">Commission Rate</span>
          <strong className="kpi-value">5%</strong>
        </div>
      </div>

      {/* Referred clients table */}
      <div className="card mt-3">
        <h2 className="dash-section-title">Your Referred Clients</h2>
        {referrals && referrals.referredClients.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Signed Up</th>
                  <th>KYC</th>
                  <th>Their Deposits</th>
                  <th>Your Earnings</th>
                </tr>
              </thead>
              <tbody>
                {referrals.referredClients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div><strong>{c.name}</strong></div>
                      <div className="mono" style={{ fontSize: 12, color: 'var(--gray-400)' }}>{c.email}</div>
                    </td>
                    <td>{new Date(c.signupDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`admin-pill ${KYC_PILL[c.kycStatus] || 'pill-gray'}`}>{c.kycStatus}</span>
                    </td>
                    <td>{formatCurrency(c.totalDeposits)}</td>
                    <td className="pos"><strong>+{formatCurrency(c.totalEarned)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="chart-loading" style={{ minHeight: 120 }}>
            {referrals ? 'No referrals yet — share your link to get started.' : 'Loading…'}
          </div>
        )}
      </div>
    </>
  );
}