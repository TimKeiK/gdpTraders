import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ArrowUpRight, AlertCircle, BarChart3, RefreshCw, HelpCircle, Wallet, TrendingUp, Landmark, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api, formatCurrency, formatPercent, type PortfolioSummary, type ActiveInvestment } from '../../api/client';
import CandlestickChart, { movingAverage, suggestMovingAverages, type Candle, type MovingAverageRef } from '../../components/CandlestickChart';
import KpiCard from '../../components/dashboard/KpiCard';
import KpiModal from '../../components/dashboard/KpiModal';
import { ProfitGrowthChart, AllocationDonut, type AllocationSlice } from '../../components/dashboard/KpiCharts';
import InvestmentPlanCard from '../../components/dashboard/InvestmentPlanCard';
import InsightBanner from '../../components/dashboard/InsightBanner';
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
type ChartType = 'candlestick' | 'line';
const MIN_WITHDRAWAL = 5;  // Strict minimum withdrawal (mirrors backend).

export default function OverviewPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [coinId, setCoinId] = useState<ChartCoinId>('bitcoin');
  const [coinPrice, setCoinPrice] = useState<number | null>(null);
  const [coinChange24h, setCoinChange24h] = useState<number | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [range, setRange] = useState<RangeKey>('1D');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [showMA, setShowMA] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [chartLoading, setChartLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [chartError, setChartError] = useState('');
  const [loadError, setLoadError] = useState('');
  const { user } = useAuth();
  const [investment, setInvestment] = useState<ActiveInvestment | null>(null);
  const [daysRemaining, setDaysRemaining] = useState(0);

  // KPI modal visibility
  const [profitModalOpen, setProfitModalOpen] = useState(false);
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);

  // Active investment record & portfolio summary loader.
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [sum, inv] = await Promise.all([
        api.getPortfolioSummary(),
        api.getInvestment(),
      ]);
      setSummary(sum);
      setInvestment(inv.investment);
      setDaysRemaining(inv.daysRemaining);
      setLoadError('');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load portfolio data.');
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 45000); // Poll every 45s so daily accruals reflect automatically
    return () => clearInterval(interval);
  }, [loadData]);

  const activeRange = RANGES.find((r) => r.key === range)!;
  const activeCoin = CHART_COINS.find((c) => c.id === coinId)!;
  const matureDate = investment?.endDate ? new Date(investment.endDate) : null;

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

  // Moving-average overlays (adaptive MA periods based on available history).
  const movingAverages = useMemo<MovingAverageRef[]>(() => {
    if (!candles.length) return [];
    const closes = candles.map((c) => c.close);
    return suggestMovingAverages(closes.length).map((ma) => ({
      label: ma.label,
      values: movingAverage(closes, ma.window),
    }));
  }, [candles]);

  // Asset allocation slices for the donut (demo breakdown derived from the portfolio).
  const allocationSlices = useMemo<AllocationSlice[]>(() => {
    if (!summary) return [];
    const btc = summary.totalValue * 0.72;
    return [
      { label: 'Bitcoin (BTC)', value: btc, color: '#F7931A' },
      { label: 'Tether (USDT)', value: Math.max(0, summary.totalValue - btc), color: '#26A17B' },
    ];
  }, [summary]);

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Investor';

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), fetchMarket()]);
    setRefreshing(false);
  };

  return (
    <>
      {loadError && (
        <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          <AlertCircle size={14} /> {loadError}
        </p>
      )}

      {/* Header + primary actions */}
      <div className="dash-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="dash-title" style={{ marginBottom: 4 }}>Welcome back, {firstName}!</h1>
          <p className="dash-last-updated" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{summary ? `Last updated ${new Date(summary.lastUpdated).toLocaleTimeString()}` : 'Loading portfolio summary…'}</span>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={handleManualRefresh}
              disabled={refreshing}
              style={{ padding: '2px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              title="Refresh balances and accruals"
            >
              <RefreshCw size={11} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
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

      {/* 1. KPI cards — personal financial status first */}
      <div className="dash-kpis">
        <KpiCard
          icon={Wallet}
          label="Total Portfolio Value"
          value={summary ? formatCurrency(summary.totalValue) : '—'}
          hero
          onOpen={() => summary && setPortfolioModalOpen(true)}
        />
        <KpiCard
          icon={TrendingUp}
          label="Total Profit"
          tone="pos"
          value={summary ? formatCurrency(summary.totalProfit) : '—'}
          sub={summary ? `${formatPercent(summary.totalProfitPercent)} all-time` : undefined}
          onOpen={() => summary && setProfitModalOpen(true)}
        />
        <KpiCard
          icon={Landmark}
          label="Initial Capital Invested"
          value={summary ? formatCurrency(summary.initialDeposit) : '—'}
        />
        <KpiCard
          icon={Lock}
          label="Available Withdrawal"
          value={summary ? formatCurrency(summary.availableWithdrawal) : '—'}
          tone={summary && summary.availableWithdrawal > 0 ? 'pos' : 'warn'}
          labelHint={
            <span className="kpi-hint" tabIndex={0} aria-label="Why is my withdrawal zero?">
              <HelpCircle size={14} />
              <span className="kpi-hint-tip" role="tooltip">
                {matureDate
                  ? `Your daily profit is credited automatically each business day and added to this balance — minimum withdrawal is $$${MIN_WITHDRAWAL}. The deposited principal stays locked until the maturity date of ${matureDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}, when it is released to this balance as well.`
                  : 'Your daily profit is credited automatically each business day and added to this balance — minimum withdrawal is $' + MIN_WITHDRAWAL + '. The deposited principal stays locked until your investment plan matures, when it is released to this balance as well.'}
              </span>
            </span>
          }
        />
      </div>
{/* 2. Actionable insight banner */}
      <InsightBanner summary={summary} />

      {/* 3. Visualized investment plan (or onboarding calls-to-action) */}
      {investment && investment.planName ? (
        <InvestmentPlanCard investment={investment} daysRemaining={daysRemaining} />
      ) : investment && investment.status === 'under_review' ? (
        <div className="card dash-alert-card" style={{ borderLeft: '3px solid var(--gold)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <AlertCircle size={20} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--gray-400)', flex: 1, minWidth: 200 }}>
            Your deposit of {formatCurrency(investment.initialDeposit)} is under review — it is below the $20 minimum
            for an investment plan. Please contact support.
          </p>
        </div>
      ) : summary && summary.initialDeposit <= 0 ? (
        <div className="card dash-alert-card" style={{ borderLeft: '3px solid var(--gold)', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <AlertCircle size={20} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--gray-400)', flex: 1, minWidth: 200 }}>
            No investment plan active yet — deposit at least $20 (Bronze Plan minimum) to get started.
          </p>
          <Link to="/dashboard/deposit" className="btn btn-sm btn-outline">Deposit</Link>
        </div>
      ) : null}

      {/* 4. Live Market Chart */}
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
            <div className="range-switch" role="group" aria-label="Chart view">
              <button type="button" className={`range-btn ${chartType === 'candlestick' ? 'active' : ''}`} onClick={() => setChartType('candlestick')}>
                Candles
              </button>
              <button type="button" className={`range-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>
                Line
              </button>
            </div>
            <div className="range-switch" role="group" aria-label="Chart overlays">
              <button
                type="button"
                className={`range-btn ${showMA ? 'active' : ''}`}
                onClick={() => setShowMA((v) => !v)}
                aria-pressed={showMA}
                title="Toggle moving averages"
              >
                MA
              </button>
              <button
                type="button"
                className={`range-btn ${showVolume ? 'active' : ''}`}
                onClick={() => setShowVolume((v) => !v)}
                aria-pressed={showVolume}
                title="Toggle volume"
              >
                Vol
              </button>
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
          <div className="chart-empty" style={{ minHeight: 380 }}>
            <BarChart3 size={30} style={{ opacity: 0.5, marginBottom: 8 }} />
            <p>{chartError}</p>
            <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => fetchMarket()}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        )}

        {!chartError && chartLoading && candles.length === 0 && !lastUpdated && (
          <div className="chart-empty" style={{ minHeight: 380 }}>
            <div className="chart-spinner" />
            <p style={{ marginTop: 12 }}>Loading live {activeCoin.label} chart…</p>
          </div>
        )}

        {candles.length > 0 && (
          <>
            <CandlestickChart
              candles={candles}
              height={380}
              timeFormat={activeRange.timeFormat}
              chartType={chartType}
              showVolume={showVolume}
              movingAverages={showMA ? movingAverages : []}
            />
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

      {/* KPI detail modals */}
      <KpiModal
        open={profitModalOpen}
        title="Profit growth"
        subtitle="Last 30 days of passive income"
        onClose={() => setProfitModalOpen(false)}
      >
        {summary && <ProfitGrowthChart currentProfit={summary.totalProfit} />}
      </KpiModal>

      <KpiModal
        open={portfolioModalOpen}
        title="Asset breakdown"
        subtitle="How your portfolio is allocated"
        onClose={() => setPortfolioModalOpen(false)}
      >
        {summary && <AllocationDonut slices={allocationSlices} totalValue={summary.totalValue} />}
      </KpiModal>
    </>
  );
}