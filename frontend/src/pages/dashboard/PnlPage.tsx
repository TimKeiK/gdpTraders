import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';
import { api, formatCurrency, type PnlSummary } from '../../api/client';
import './DashboardPages.css';

export default function PnlPage() {
  const [pnl, setPnl] = useState<PnlSummary | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let mounted = true;
    api
      .getPnl()
      .then((p) => {
        if (mounted) {
          setPnl(p);
          setLoadError('');
        }
      })
      .catch((err) => {
        if (mounted) setLoadError(err instanceof Error ? err.message : 'Failed to load profit & loss data.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <h1 className="dash-title">Profit &amp; Loss</h1>
      <p className="dash-last-updated">
        {pnl
          ? `Last updated ${new Date(pnl.lastUpdated).toLocaleString()}`
          : 'Loading profit & loss statement…'}
      </p>

      {loadError && (
        <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          <AlertCircle size={14} /> {loadError}
        </p>
      )}

      {/* P&L KPI cards */}
      <div className="dash-kpis">
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><TrendingUp size={20} /></span>
          <span className="kpi-label">Total Profit</span>
          <strong className="kpi-value pos">{pnl ? formatCurrency(pnl.totalProfit) : '—'}</strong>
        </div>
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><TrendingDown size={20} /></span>
          <span className="kpi-label">Total Loss</span>
          <strong className="kpi-value neg">{pnl ? formatCurrency(-pnl.totalLoss) : '—'}</strong>
        </div>
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><Activity size={20} /></span>
          <span className="kpi-label">Net P&L</span>
          <strong className={`kpi-value ${(pnl?.netPnl ?? 0) >= 0 ? 'pos' : 'neg'}`}>
            {pnl ? `${pnl.netPnl >= 0 ? '+' : ''}${formatCurrency(pnl.netPnl)}` : '—'}
          </strong>
        </div>
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><Activity size={20} /></span>
          <span className="kpi-label">Return on Deposits</span>
          <strong className={`kpi-value ${(pnl?.netPnlPercent ?? 0) >= 0 ? 'pos' : 'neg'}`}>
            {pnl ? `${pnl.netPnlPercent >= 0 ? '+' : ''}${pnl.netPnlPercent.toFixed(2)}%` : '—'}
          </strong>
        </div>
      </div>

      {/* P&L activity */}
      <div className="card mt-3">
        <h2 className="dash-section-title">P&L Activity</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>
          Profits credited and losses debited to your account, recorded on the immutable ledger.
        </p>
        {pnl && pnl.entries.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {pnl.entries.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.date).toLocaleString()}</td>
                  <td>
                    <span className={e.kind === 'Profit' ? 'pos' : 'neg'}>
                      <strong>{e.kind}</strong>
                    </span>
                  </td>
                  <td>{e.asset}</td>
                  <td className={e.amount >= 0 ? 'pos' : 'neg'}>
                    <strong>{e.amount >= 0 ? '+' : ''}{formatCurrency(e.amount)}</strong>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{e.referenceId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="chart-loading">
            {pnl ? 'No profit or loss activity yet.' : 'Loading…'}
          </div>
        )}
      </div>
    </>
  );
}
