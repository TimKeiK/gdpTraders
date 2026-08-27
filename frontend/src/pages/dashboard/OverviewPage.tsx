import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Plus, ArrowUpRight, AlertCircle, BarChart3, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api, formatCurrency, type PortfolioSummary, type StrategyAllocation } from '../../api/client';
import './DashboardPages.css';

export default function OverviewPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [allocations, setAllocations] = useState<StrategyAllocation[]>([]);
  const [usdtPrice, setUsdtPrice] = useState<number | null>(null);
  const [usdtChange24h, setUsdtChange24h] = useState<number | null>(null);
  const [usdtChartData, setUsdtChartData] = useState<Array<{ time: string; price: number }>>([]);
  const [loadError, setLoadError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getPortfolioSummary(), api.getStrategyAllocations()])
      .then(([s, a]) => {
        if (mounted) {
          setSummary(s);
          setAllocations(a);
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

  // Fetch USDT price and historical data from CoinGecko API (free, no auth required)
  useEffect(() => {
    const fetchUsdtData = async () => {
      try {
        // Fetch current price and 24h change
        const priceRes = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd&include_24hr_change=true'
        );
        const priceData = await priceRes.json();
        if (priceData.tether) {
          setUsdtPrice(priceData.tether.usd);
          setUsdtChange24h(priceData.tether.usd_24h_change);
        }

        // Fetch 24h historical data for chart
        const chartRes = await fetch(
          'https://api.coingecko.com/api/v3/coins/tether/market_chart?vs_currency=usd&days=1&interval=hourly'
        );
        const chartDataRaw = await chartRes.json();
        if (chartDataRaw.prices) {
          const chartPoints = chartDataRaw.prices.map((p: [number, number]) => ({
            time: new Date(p[0]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            price: p[1],
          }));
          setUsdtChartData(chartPoints);
        }
      } catch (err) {
        console.error('Failed to fetch USDT data:', err);
      }
    };
    fetchUsdtData();
    const interval = setInterval(fetchUsdtData, 60000); // Update every 60 seconds
    return () => clearInterval(interval);
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
        {summary && (
          <div className="card card-hover kpi-card">
            <span className="kpi-icon"><TrendingUp size={20} /></span>
            <span className="kpi-label">Total Profit</span>
            <strong className="kpi-value pos">{formatCurrency(summary.totalProfit)}</strong>
          </div>
        )}
        {summary && (
          <div className="card card-hover kpi-card">
            <span className="kpi-icon"><TrendingDown size={20} /></span>
            <span className="kpi-label">Total Loss</span>
            <strong className="kpi-value neg">{formatCurrency(-summary.totalLoss)}</strong>
          </div>
        )}
        {summary && (
          <div className="card card-hover kpi-card">
            <span className="kpi-icon"><Activity size={20} /></span>
            <span className="kpi-label">Total P&L</span>
            <strong className={`kpi-value ${summary.totalPnl >= 0 ? 'pos' : 'neg'}`}>
              {summary.totalPnl >= 0 ? '+' : ''}{formatCurrency(summary.totalPnl)}
            </strong>
          </div>
        )}
      </div>

      {/* Live USDT Trading Chart */}
      <div className="card mt-3">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 className="dash-section-title" style={{ marginBottom: 4 }}>Tether (USDT) - Live Price Chart</h2>
            <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: 0 }}>24-hour price movement</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {usdtPrice && (
              <div style={{ textAlign: 'right' }}>
                <strong style={{ fontSize: 18 }}>{formatCurrency(usdtPrice)}</strong>
                <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: '4px 0 0 0' }}>
                  <span className={usdtChange24h && usdtChange24h >= 0 ? 'pos' : 'neg'}>
                    {usdtChange24h ? `${usdtChange24h >= 0 ? '+' : ''}${usdtChange24h.toFixed(2)}%` : '—'}
                  </span>
                  {' '}24h
                </p>
              </div>
            )}
          </div>
        </div>
        {usdtChartData.length > 0 ? (
          <div style={{ height: 280, backgroundColor: 'rgba(139, 92, 246, 0.03)', borderRadius: 8, padding: 16, position: 'relative', overflow: 'hidden' }}>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} viewBox={`0 0 ${Math.max(usdtChartData.length * 8, 400)} 280`} preserveAspectRatio="none">
              {usdtChartData.length > 0 && (
                <>
                  {/* Generate candlesticks from hourly data */}
                  {usdtChartData.map((d, i) => {
                    const minPrice = Math.min(...usdtChartData.map(x => x.price));
                    const maxPrice = Math.max(...usdtChartData.map(x => x.price));
                    const range = maxPrice - minPrice || 1;
                    const candleWidth = Math.max(2, 6);
                    const spacing = 8;
                    const x = i * spacing;
                    const open = d.price;
                    const close = i < usdtChartData.length - 1 ? usdtChartData[i + 1].price : d.price;
                    const high = Math.max(open, close);
                    const low = Math.min(open, close);
                    const highY = 260 - ((high - minPrice) / range) * 260;
                    const lowY = 260 - ((low - minPrice) / range) * 260;
                    const openY = 260 - ((open - minPrice) / range) * 260;
                    const closeY = 260 - ((close - minPrice) / range) * 260;
                    const isGreen = close >= open;
                    const color = isGreen ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)';
                    const bodyColor = isGreen ? 'rgba(16, 185, 129, 0.9)' : 'rgba(239, 68, 68, 0.9)';

                    return (
                      <g key={i}>
                        {/* Wick (high-low line) */}
                        <line x1={x + candleWidth / 2} y1={highY} x2={x + candleWidth / 2} y2={lowY} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        {/* Body (open-close rectangle) */}
                        <rect
                          x={x}
                          y={Math.min(openY, closeY)}
                          width={candleWidth}
                          height={Math.abs(closeY - openY) || 1}
                          fill={bodyColor}
                          stroke={bodyColor}
                          strokeWidth="0.5"
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    );
                  })}
                </>
              )}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1, paddingTop: 240, fontSize: 11, color: 'var(--gray-500)' }}>
              <span>{usdtChartData[0]?.time}</span>
              <span>{usdtChartData[Math.floor(usdtChartData.length / 2)]?.time}</span>
              <span>{usdtChartData[usdtChartData.length - 1]?.time}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 280, backgroundColor: 'rgba(139, 92, 246, 0.05)', borderRadius: 8, padding: 20 }}>
            <div style={{ textAlign: 'center', color: 'var(--gray-400)' }}>
              <BarChart3 size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
              <p>Loading USDT live trading chart...</p>
            </div>
          </div>
        )}
      </div>

      {/* Allocations */}
      <div className="card mt-3">
        <h2 className="dash-section-title">Live Strategy Allocations</h2>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 16 }}>Real-time allocations from your portfolio database</p>
        {allocations && allocations.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Allocation (USD)</th>
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
        ) : (
          <div className="chart-loading">No active strategy allocations</div>
        )}
      </div>
    </>
  );
}