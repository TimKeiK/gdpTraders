import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Wallet, Activity, Plus, ArrowUpRight, AlertCircle } from 'lucide-react';
import TrackRecordChart from '../../components/TrackRecordChart';
import { useAuth } from '../../contexts/AuthContext';
import { api, formatCurrency, formatDate, formatPercent, type PerformancePoint, type PortfolioSummary, type StrategyAllocation } from '../../api/client';
import './DashboardPages.css';

export default function OverviewPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [allocations, setAllocations] = useState<StrategyAllocation[]>([]);
  const [perf, setPerf] = useState<PerformancePoint[]>([]);
  const [loadError, setLoadError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getPortfolioSummary(), api.getStrategyAllocations(), api.getPerformanceSeries(60)])
      .then(([s, a, p]) => {
        if (mounted) {
          setSummary(s);
          setAllocations(a);
          setPerf(p);
          setLoadError('');
        }
      })
      .catch((err) => {
        if (mounted) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load portfolio data.');
        }
      });
    return () => { mounted = false; };
  }, []);

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Investor';

  return (
    <>
      {loadError && (
        <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          <AlertCircle size={14} /> {loadError}
        </p>
      )}

      <div className="dash-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="dash-title" style={{ marginBottom: 4 }}>Welcome back, {firstName}!</h1>
          <p className="dash-last-updated" style={{ margin: 0 }}>
            {summary ? `Last updated ${new Date(summary.lastUpdated).toLocaleString()}` : 'Loading portfolio summary…'}
          </p>
        </div>
        <div className="dash-actions" style={{ display: 'flex', gap: 12 }}>
          <Link to="/dashboard/deposit" className="btn btn-primary" style={{ boxShadow: 'var(--shadow-glow)' }}>
            <Plus size={18} /> Deposit Funds
          </Link>
          <Link to="/dashboard/transactions" className="btn btn-outline">
            History <ArrowUpRight size={16} />
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="dash-kpis">
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><Wallet size={20} /></span>
          <span className="kpi-label">Total Portfolio Value</span>
          <strong className="kpi-value">{summary ? formatCurrency(summary.totalValue) : '—'}</strong>
        </div>
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><Activity size={20} /></span>
          <span className="kpi-label">Total P&L</span>
          <strong className={`kpi-value ${summary && summary.totalPnl >= 0 ? 'pos' : 'neg'}`}>
            {summary ? formatCurrency(summary.totalPnl) : '—'}
            <small>{summary ? formatPercent(summary.totalPnlPercent) : ''}</small>
          </strong>
        </div>
        <div className="card card-hover kpi-card">
          <span className={`kpi-icon ${summary && summary.todayPnl >= 0 ? 'pos' : 'neg'}`}>
            {summary && summary.todayPnl >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          </span>
          <span className="kpi-label">Today's P&L</span>
          <strong className={`kpi-value ${summary && summary.todayPnl >= 0 ? 'pos' : 'neg'}`}>
            {summary ? formatCurrency(summary.todayPnl) : '—'}
            <small>{summary ? formatPercent(summary.todayPnlPercent) : ''}</small>
          </strong>
        </div>
      </div>

      {/* Performance chart */}
      <div className="card mt-3">
        <h2 className="dash-section-title">Performance vs. Benchmark</h2>
        {perf.length > 0 ? (
          <TrackRecordChart
            labels={perf.map((p) => formatDate(p.date))}
            portfolioData={perf.map((p) => p.portfolio)}
            benchmarkData={perf.map((p) => p.benchmark)}
            height={280}
          />
        ) : (
          <div className="chart-loading">Loading performance…</div>
        )}
      </div>

      {/* Allocations */}
      <div className="card mt-3">
        <h2 className="dash-section-title">Strategy Allocations</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Allocation</th>
              <th>Weight</th>
              <th>24h P&L</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a) => (
              <tr key={a.strategyId}>
                <td><strong>{a.strategyName}</strong></td>
                <td>{formatCurrency(a.allocation)}</td>
                <td>{a.weight.toFixed(1)}%</td>
                <td className={a.pnl24h >= 0 ? 'pos' : 'neg'}>
                  {a.pnl24h >= 0 ? '+' : ''}{formatCurrency(a.pnl24h)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}