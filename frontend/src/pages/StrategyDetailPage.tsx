import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CheckCircle2, DollarSign, Gauge, Percent } from 'lucide-react';
import TrackRecordChart from '../components/TrackRecordChart';
import { api, formatDate, type PerformancePoint } from '../api/client';
import { getStrategyById } from '../data/strategies';
import './StrategyDetailPage.css';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function StrategyDetailPage() {
  const { id } = useParams();
  const strategy = getStrategyById(id);
  const [perf, setPerf] = useState<PerformancePoint[]>([]);

  useEffect(() => {
    let mounted = true;
    api.getPerformanceSeries(60).then((data) => {
      if (mounted) setPerf(data);
    });
    return () => { mounted = false; };
  }, []);

  if (!strategy) {
    return (
      <section className="section">
        <div className="container text-center">
          <h1>Strategy not found</h1>
          <Link to="/strategies" className="btn btn-outline mt-3">Back to Strategies</Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <Link to="/strategies" className="detail-back">
            <ArrowLeft size={16} /> All Strategies
          </Link>
          <div className="detail-title-row">
            <div>
              <h1 className="page-hero-title">{strategy.name}</h1>
              <p className="page-hero-subtitle">{strategy.mechanism}</p>
            </div>
            <span className={`badge badge-${strategy.volatilityClass} detail-vol`}>
              {strategy.volatilityProfile} Volatility
            </span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {/* Key facts */}
          <div className="grid-4 detail-facts">
            <div className="card detail-fact">
              <Gauge size={20} />
              <span className="detail-fact-label">Asset Focus</span>
              <strong>{strategy.assetFocus}</strong>
            </div>
            <div className="card detail-fact">
              <DollarSign size={20} />
              <span className="detail-fact-label">Min. Investment</span>
              <strong>{fmt(strategy.minInvestment)}</strong>
            </div>
            <div className="card detail-fact">
              <Percent size={20} />
              <span className="detail-fact-label">Fees</span>
              <strong>{strategy.managementFee} + {strategy.performanceFee}</strong>
            </div>
            <div className="card detail-fact">
              <CheckCircle2 size={20} />
              <span className="detail-fact-label">Liquidity</span>
              <strong>{strategy.liquidity}</strong>
            </div>
          </div>

          {/* Description */}
          <div className="grid-2 mt-4">
            <div>
              <h2 className="section-title" style={{ fontSize: 24 }}>How it works</h2>
              <p className="detail-description">{strategy.description}</p>
              <h3 className="detail-sub">Benchmark</h3>
              <p className="detail-description">{strategy.benchmark}</p>
            </div>

            {/* Performance chart */}
            <div className="card">
              <h3 className="detail-sub">Backtested Performance (Indexed to 100)</h3>
              {perf.length > 0 ? (
                <TrackRecordChart
                  labels={perf.map((p) => formatDate(p.date))}
                  portfolioData={perf.map((p) => p.portfolio)}
                  benchmarkData={perf.map((p) => p.benchmark)}
                  height={280}
                />
              ) : (
                <div className="chart-loading">Loading…</div>
              )}
            </div>
          </div>

          {/* Highlights & Risks */}
          <div className="grid-2 mt-4">
            <div className="card">
              <h3 className="detail-sub">Key Highlights</h3>
              <ul className="detail-list detail-list-good">
                {strategy.highlights.map((h) => (
                  <li key={h}><CheckCircle2 size={16} /> {h}</li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3 className="detail-sub">Risks</h3>
              <ul className="detail-list detail-list-bad">
                {strategy.risks.map((r) => (
                  <li key={r}><AlertTriangle size={16} /> {r}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="detail-cta card">
            <div>
              <h3>Interested in {strategy.name}?</h3>
              <p>Complete the due diligence process to access the secure data-room.</p>
            </div>
            <Link to="/whitepaper" className="btn btn-primary">Read the White Paper</Link>
          </div>
        </div>
      </section>
    </>
  );
}