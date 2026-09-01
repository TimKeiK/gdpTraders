import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Plus, ArrowUpRight, AlertCircle, TrendingUp, Landmark, Lock, BarChart3, RefreshCw, BadgeCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api, formatCurrency, formatPercent, type PortfolioSummary, type ActiveInvestment } from '../../api/client';
import CandlestickChart, { type Candle } from '../../components/CandlestickChart';
import './DashboardPages.css';

type RangeKey = '1D' | '7D' | '30D';

const RANGES: { key: RangeKey; label: string; range: '24h' | '7d' | '30d'; timeFormat: 'time' | 'date'; sub: string }[] = [
  { key: '1D', label: '24H', range: '24h', timeFormat: 'time', sub: 'Hourly candlesticks' },
  { key: '7D', label: '7D', range: '7d', timeFormat: 'date', sub: '4-hour candlesticks' },
  { key: '30D', label: '30D', range: '30d', timeFormat: 'date', sub: 'Daily candlesticks' },
];

const CHART_COINS = [
  { id: 'bitcoin', label: 'BTC', name: 'Bitcoin' },
  { id: 'ethereum', label: 'ETH', name: 'Ethereum' },
  { id: 'tether', label: 'USDT', name: 'Tether' },
] as const;

type ChartCoinId = (typeof CHART_COINS)[number]['id'];

export default function OverviewPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [coinId, setCoinId] = useState<ChartCoinId>('bitcoin');
  const [coinPrice, setCoinPrice] = useState<number | null>(null);
  const [coinChange24h, setCoinChange24h] = useState<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [range, setRange] = useState<RangeKey>('1D');
  const [chartLoading, setChartLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [chartError, setChartError] = useState('');
  const [loadError, setLoadError] = useState('');
  const { user } = useAuth();
  const [investment, setInvestment] = useState<ActiveInvestment | null>(null);
  const [daysRemaining, setDaysRemaining] = useState(0);

  // Active investment record (straight from the investments table).
  useEffect(() => {
    let mounted = true;
    api.getInvestment().then((res) => {
      if (!mounted) return;
      setInvestment(res.investment);
      setDaysRemaining(res.daysRemaining);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const activeRange = RANGES.find((r) => r.key === range)!;
  const activeCoin = CHART_COINS.find((c) => c.id === coinId)!;

  // Portfolio summary (backend API).
  useEffect(() => {
    let mounted = true;
    api.getPortfolioSummary().then((s) => {
      if (mounted) setSummary(s);
    }).catch((err) => {
      if (mounted) setLoadError(err instanceof Error ? err.message : 'Failed to load portfolio data.');
    });
    return () => { mounted = false; };
  }, []);

  // Live price + OHLC candlesticks via the backend market proxy
  // (cached, rate-limit safe), refreshed every 30s for a real-time feel.
  const fetchMarket = useCallback(async () => {
    try {
      const [summaryRes, ohlcRes] = await Promise.all([
        fetch(`/api/market/summary?coin=${coinId}`),
        fetch(`/api/market/ohlc?coin=${coinId}&range=${activeRange.range}`),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setCoinPrice(data.priceUsd);
        setCoinChange24h(data.change24h);
      }

      if (ohlcRes.ok) {
        const data = await ohlcRes.json();
        const parsed: Candle[] = Array.isArray(data.candles) ? data.candles : [];
        if (parsed.length) setCandles(parsed);
        setChartError('');
      } else {
        setChartError('Unable to load live chart. Retrying…');
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Chart fetch failed:', err);
      setChartError('Unable to load live chart. Retrying…');
    } finally {
      setChartLoading(false);
    }
  }, [coinId, activeRange.range]);

  useEffect(() => {
    let cancel = false;
    const run = () => {
      if (!cancel) fetchMarket();
    };
    setChartLoading(true);
    run();
    const id = setInterval(run, 30000); // refresh every 30s for a real-time feel
    return () => { cancel = true; clearInterval(id); };
  }, [fetchMarket]);

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

      {/* Current Investment Plan — reads directly from the investments table */}
      {investment && investment.planName ? (
        <div className="card" style={{ padding: '18px 22px', marginBottom: 20, borderLeft: '3px solid var(--gold)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <BadgeCheck size={22} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--gold)' }}>Current Investment Plan: {investment.planName} Plan</h3>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-400)' }}>
              {daysRemaining > 0 ? `${daysRemaining} working day${daysRemaining === 1 ? '' : 's'} remaining` : 'Matured'}
            </span>
          </div>
          <div className="plan-banner-stats" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Initial Deposit</div>
              <strong style={{ fontSize: 16 }}>{formatCurrency(investment.initialDeposit)}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Daily Accrual</div>
              <strong style={{ fontSize: 16, color: 'var(--green)' }}>{investment.dailyRate}%</strong>
            </div>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Duration</div>
              <strong style={{ fontSize: 16 }}>{investment.durationDays} working days</strong>
            </div>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Expected Total Payout</div>
              <strong style={{ fontSize: 16, color: 'var(--gold)' }}>{formatCurrency(investment.totalExpectedReturn ?? 0)}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Matures On</div>
              <strong style={{ fontSize: 16 }}>{investment.endDate ? new Date(investment.endDate).toLocaleDateString() : '—'}</strong>
            </div>
          </div>
        </div>
      ) : investment && investment.status === 'under_review' ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 22px', marginBottom: 20, borderLeft: '3px solid var(--gold)' }}>
          <BadgeCheck size={22} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--gray-400)', flex: 1, minWidth: 200 }}>
            Your deposit of {formatCurrency(investment.initialDeposit)} is under review — it is below the $20 minimum
            for an investment plan. Please contact support.
          </p>
        </div>
      ) : summary && summary.initialDeposit <= 0 && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 22px', marginBottom: 20, borderLeft: '3px solid var(--gold)' }}>
          <BadgeCheck size={22} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--gray-400)', flex: 1, minWidth: 200 }}>
            No investment plan active yet — deposit at least $20 (Bronze Plan minimum) to get started.
          </p>
          <Link to="/dashboard/deposit" className="btn btn-sm btn-outline">Deposit</Link>
        </div>
      )}

      {/* KPI cards */}
      <div className="dash-kpis">
        <div className="card card-hover kpi-card">
          <span className="kpi-icon"><Wallet size={20} /></span>
          <span className="kpi-label">Total Portfolio Value</span>
          <strong className="kpi-value">{summary ? formatCurrency(summary.totalValue) : '—'}</strong>
        </div>
        {summary && (
          <div className="card card-hover kpi-card">
            <span className="kpi-icon"><TrendingUp size={20} /></span>
            <span className="kpi-label">Total Profit</span>
            <strong className="kpi-value pos">{formatCurrency(summary.totalProfit)}</strong>
          </div>
        )}
        {summary && (
          <div className="card card-hover kpi-card">
            <span className="kpi-icon"><Landmark size={20} /></span>
            <span className="kpi-label">Initial Capital Invested</span>
            <strong className="kpi-value">{formatCurrency(summary.initialDeposit)}</strong>
          </div>
        )}
        {summary && (
          <div className="card card-hover kpi-card">
            <span className="kpi-icon"><Lock size={20} /></span>
            <span className="kpi-label">Available Withdrawal</span>
            <strong className="kpi-value pos">{formatCurrency(summary.availableWithdrawal)}</strong>
          </div>
        )}
      </div>

      {/* Live Market Candlestick Chart */}
      <div className="card mt-3 chart-card-wrap">
        <div className="chart-card-head">
          <div>
            <div className="chart-title-row">
              <h2 className="dash-section-title" style={{ marginBottom: 6 }}>
                {activeCoin.name} ({activeCoin.label}) — Live Price Chart
              </h2>
              <span className="live-badge"><span className="live-dot" /> LIVE</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--gray-400)', margin: 0 }}>{activeRange.sub}</p>
          </div>

          <div className="chart-card-controls">
            <div className="range-switch" role="group" aria-label="Select coin">
              {CHART_COINS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`range-btn ${coinId === c.id ? 'active' : ''}`}
                  onClick={() => setCoinId(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="range-switch" role="group" aria-label="Select range">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  className={`range-btn ${range === r.key ? 'active' : ''}`}
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {coinPrice && (
              <div style={{ textAlign: 'right', minWidth: 120 }}>
                <strong className="chart-price">{formatCurrency(coinPrice)}</strong>
                <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: '4px 0 0 0' }}>
                  <span className={coinChange24h != null && coinChange24h >= 0 ? 'pos' : 'neg'}>
                    {formatPercent(coinChange24h)}
                  </span>{' '}24h
                </p>
              </div>
            )}
          </div>
        </div>

        {chartError && !candles.length && (
          <div className="chart-empty" style={{ minHeight: 320 }}>
            <BarChart3 size={30} style={{ opacity: 0.5, marginBottom: 8 }} />
            <p>{chartError}</p>
            <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => fetchMarket()}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        )}

        {!chartError && chartLoading && candles.length === 0 && !lastUpdated && (
          <div className="chart-empty" style={{ minHeight: 320 }}>
            <div className="chart-spinner" />
            <p style={{ marginTop: 12 }}>Loading live {activeCoin.label} chart…</p>
          </div>
        )}

        {candles.length > 0 && (
          <>
            <CandlestickChart candles={candles} height={340} timeFormat={activeRange.timeFormat} />
            <div className="chart-footer">
              <span>
                {lastUpdated
                  ? `Updated ${lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : 'Updating…'}
              </span>
              <span>Hover any candle for details · Auto-refreshes every 30s</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}