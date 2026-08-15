import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  Activity,
  Clock,
  ArrowRight,
  LineChart,
  Scale,
  Lock,
  FileText,
  Wallet,
  Users,
  Fingerprint,
  MessagesSquare,
  FileBarChart,
} from 'lucide-react';
import TrackRecordChart from '../components/TrackRecordChart';
import { api, formatDate, type PerformancePoint } from '../api/client';
import { strategies } from '../data/strategies';
import './HomePage.css';

const proofBarItems = [
  { icon: Activity, text: '24/7 Risk Monitoring' },
  { icon: Clock, text: 'Updated Every 15 Minutes' },
  { icon: ShieldCheck, text: 'Multi-Signature Cold Storage' },
];

const dashboardFeatures = [
  { icon: LineChart, title: 'Live P&L', text: 'Real-time portfolio valuation, updated every 15 minutes with full position-level transparency.' },
  { icon: FileBarChart, title: 'Tax Reporting', text: 'One-click export of capital gains and losses, ready for your accountant at tax season.' },
  { icon: Lock, title: 'Immutable Ledger', text: 'A tamper-evident transaction history of every trade executed on your behalf.' },
  { icon: Fingerprint, title: 'Address Whitelisting', text: 'Crypto address whitelisting with a 48-hour cooling-off period to prevent unauthorized transfers.' },
  { icon: MessagesSquare, title: 'Dedicated Support', text: 'Secure in-app messaging with your dedicated Account Executive — not a bot.' },
  { icon: Users, title: 'Due Diligence', text: 'Full PM bios and track records shared securely under NDA during onboarding.' },
];

function HeroSection() {
  return (
    <section className="hero">
      <div className="hero-bg" aria-hidden />
      <div className="hero-bg-overlay" aria-hidden />
      <div className="container hero-inner">
        {/* <span className="hero-badge">
          <ShieldCheck size={14} />
          For Professional & Accredited Investors
        </span> */}
        <h1 className="hero-title">
          Outperform Inflation with{' '}
          <span className="hero-accent">Algorithmic Crypto Strategies.</span>
        </h1>
        <p className="hero-subtitle">
          We manage digital asset portfolios using quantitative models, deep liquidity, and
          military-grade cold storage. Built for accredited investors seeking non-correlated
          returns.
        </p>
        <div className="hero-actions">
          <Link to="/strategies" className="btn btn-primary btn-lg">
            View Our Strategy <ArrowRight size={18} />
          </Link>
          <Link to="/whitepaper" className="btn btn-outline-light btn-lg">
            Read the White Paper
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProofBar() {
  return (
    <section className="proof-bar">
      <div className="container proof-bar-inner">
        {proofBarItems.map((item, idx) => (
          <div className="proof-item" key={idx}>
            <item.icon size={18} />
            <span>{item.text}</span>
            {item.text === '24/7 Risk Monitoring' && <span className="proof-dot" aria-hidden />}
          </div>
        ))}
      </div>
    </section>
  );
}

function TrackRecordSection({ perf }: { perf: PerformancePoint[] }) {
  return (
    <section className="section">
      <div className="container">
        <div className="track-record">
          <div className="track-record-head">
            <div>
              <span className="eyebrow">Our Track Record</span>
              <h2 className="section-title">Performance vs. the Bitcoin Benchmark</h2>
              <p className="section-subtitle">
                Indexed to 100. We publish our performance against a passive BTC benchmark —
                no placeholder stats, no hype. Historical backtested data is shared via a
                secure data-room during onboarding.
              </p>
            </div>
            <div className="track-record-note card">
              <Scale size={20} />
              <p>
                <strong>Benchmark:</strong> BTC Index · Performance shown is re-indexed.
                Past performance is not indicative of future results.
              </p>
            </div>
          </div>

          {perf.length > 0 ? (
            <div className="chart-card">
              <TrackRecordChart
                labels={perf.map((p) => formatDate(p.date))}
                portfolioData={perf.map((p) => p.portfolio)}
                benchmarkData={perf.map((p) => p.benchmark)}
                height={360}
              />
            </div>
          ) : (
            <div className="card chart-loading">Loading track record…</div>
          )}
        </div>
      </div>
    </section>
  );
}

function StrategiesSection() {
  return (
    <section className="section strategies-section">
      <div className="container">
        <div className="text-center mb-4">
          <span className="eyebrow">Investment Products</span>
          <h2 className="section-title">100% Crypto. Zero Distractions.</h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            Four systematically managed strategies focused exclusively on digital assets and
            DeFi yield.
          </p>
        </div>

        <div className="grid-2">
          {strategies.map((s) => (
            <Link to={`/strategies/${s.id}`} className="card card-hover strategy-card" key={s.id}>
              <div className="strategy-card-top">
                <h3 className="strategy-card-name">{s.name}</h3>
                <span className={`badge badge-${s.volatilityClass}`}>
                  {s.volatilityProfile} Vol
                </span>
              </div>
              <p className="strategy-card-focus">{s.assetFocus}</p>
              <p className="strategy-card-mech">{s.mechanism}</p>
              <div className="strategy-card-footer">
                <span className="strategy-card-min">
                  Min. {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(s.minInvestment)}
                </span>
                <span className="strategy-card-link">
                  Details <ArrowRight size={14} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeesTeaser() {
  return (
    <section className="section fees-teaser">
      <div className="container">
        <div className="fees-teaser-inner">
          <div>
            <span className="eyebrow">Full Fee Transparency</span>
            <h2 className="section-title" style={{ color: 'var(--white)' }}>
              We Hate Hidden Fees.
            </h2>
            <p className="fees-teaser-text">
              1.5% management fee. 15% performance fee, only when we beat the benchmark —
              with a High Water Mark. No entry fees. No load fees. $0 withdrawal fee.
            </p>
            <Link to="/fees" className="btn btn-primary mt-3">
              See the Full Fee Schedule <ArrowRight size={16} />
            </Link>
          </div>
          <div className="card fees-teaser-card">
            <div className="fee-card-row">
              <Wallet size={20} />
              <div>
                <strong>1.5% p.a.</strong>
                <span>Management Fee</span>
              </div>
            </div>
            <div className="fee-card-row">
              <LineChart size={20} />
              <div>
                <strong>15% of profits</strong>
                <span>Performance Fee (HWM applies)</span>
              </div>
            </div>
            <div className="fee-card-row">
              <FileText size={20} />
              <div>
                <strong>$0</strong>
                <span>Withdrawal & Entry Fees</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardFeatures() {
  return (
    <section className="section">
      <div className="container">
        <div className="text-center mb-5">
          <span className="eyebrow">Client Dashboard</span>
          <h2 className="section-title">Institutional-Grade Investor Experience</h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            The dashboard is designed around one principle: total visibility into your capital.
          </p>
        </div>

        <div className="grid-3">
          {dashboardFeatures.map((f) => (
            <div className="card feature-card" key={f.title}>
              <span className="feature-icon">
                <f.icon size={22} />
              </span>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-text">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="section cta-section">
      <div className="container text-center">
        <h2 className="section-title" style={{ color: 'var(--white)' }}>
          Begin the Due Diligence Process
        </h2>
        <p className="cta-text">
          We are accepting a limited number of accredited investors into our closed beta.
          Request the white paper to begin.
        </p>
        <div className="cta-actions">
          <Link to="/whitepaper" className="btn btn-primary btn-lg">
            Read the White Paper <ArrowRight size={18} />
          </Link>
          <Link to="/about" className="btn btn-outline-light btn-lg">
            Meet the Firm
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [perf, setPerf] = useState<PerformancePoint[]>([]);

  useEffect(() => {
    let mounted = true;
    api.getPerformanceSeries(60).then((data) => {
      if (mounted) setPerf(data);
    });
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <HeroSection />
      <ProofBar />
      <TrackRecordSection perf={perf} />
      <StrategiesSection />
      <FeesTeaser />
      <DashboardFeatures />
      <CtaSection />
    </>
  );
}