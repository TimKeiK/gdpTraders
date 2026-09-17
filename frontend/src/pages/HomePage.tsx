import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import CountUp from 'react-countup';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ShieldCheck, Activity, Clock, ArrowRight, LineChart, Lock, FileText,
  Wallet, Users, Fingerprint, MessagesSquare, FileBarChart, TrendingUp,
} from 'lucide-react';
import Reveal from '../components/motion/Reveal';
import TiltCard from '../components/motion/TiltCard';
import Magnetic from '../components/motion/Magnetic';
import HeroParticles from '../components/motion/HeroParticles';
import './HomePage.css';

gsap.registerPlugin(ScrollTrigger);

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

// TODO: Replace placeholder answers with content you can actually stand behind
// and substantiate (regulatory filings, named/verifiable custodian, audited
// performance data, etc.) before this goes live.
const faqs = [
  {
    q: 'Who can invest with GDPTraders?',
    a: 'Access is strictly limited to Professional Investors and Accredited Investors (individuals, family offices, and institutions). All prospective investors must complete a mandatory KYC/AML verification and Source of Funds check before any capital is accepted into the fund.'
  },
  {
    q: 'How do I see the track record?',
    a: 'To protect our operational security and the privacy of our limited partners, we do not publish live or historical performance metrics publicly. Full backtested data, audited track records, and Portfolio Manager CVs are shared exclusively through our secure data-room during the private onboarding process, after a standard NDA is executed.'
  },
  {
    q: 'Are there any hidden fees?',
    a: 'Absolutely none. We operate on a fully transparent fee schedule: a 1.5% annual management fee (charged monthly on AUM) and a 15% performance fee on new profits—strictly enforced with a High Water Mark, meaning we only earn performance fees when your portfolio reaches a new all-time high. There are zero entry/load fees, zero exit fees, and zero withdrawal fees. (Network gas fees are passed through at exact cost.)'
  },
  {
    q: 'How is my crypto secured?',
    a: 'Assets are held in institutional-grade, multi-signature cold storage. On the operational side, we enforce crypto address whitelisting with a mandatory 48-hour cooling-off period for newly added addresses to prevent unauthorized transfers. This is paired with 24/7 automated risk monitoring and a tamper-evident ledger for every trade executed on your behalf.'
  },
  {
    q: 'Can I withdraw my funds anytime?',
    a: 'Yes. You retain full control of your capital. Fiat withdrawals are processed within 1–3 business days, while crypto withdrawals to your pre-whitelisted external wallets are processed instantly. There are no lock-up periods or exit penalties.'
  },
  {
    q: 'Do you custody assets yourselves?',
    a: 'No. We partner with regulated, institutional-grade third-party custodians to ensure strict segregation of client funds and operational security. Formal custody, execution, and legal infrastructure partners will be named publicly here on the website once all contracts are formally executed and confirmed in writing—a process we prioritize for full regulatory transparency.'
  }
];

const depositPlans = [
  { rank: '🥉', name: 'Bronze', deposit: '$20 – $499', daily: '3%', dailyValue: 3, duration: '50 Working Days' },
  { rank: '🥈', name: 'Silver', deposit: '$500 – $1,499', daily: '5%', dailyValue: 5, duration: '100 Working Days' },
  { rank: '💎', name: 'Diamond', deposit: '$1,500 – $2,499', daily: '7%', dailyValue: 7, duration: '150 Working Days' },
  { rank: '🥇', name: 'Gold', deposit: '$2,500 – $4,999', daily: '10%', dailyValue: 10, duration: '200 Working Days' },
  { rank: '👑', name: 'Rhodium', deposit: '$5,000+', daily: '20%', dailyValue: 20, duration: '250 Working Days' },
];

/* ================= HERO ================= */

/** Deterministic pseudo-random candlestick data (stable across renders). */
function seededBars(count: number, seed: number) {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  let level = 60;
  return Array.from({ length: count }, (_, i) => {
    const open = level;
    level = Math.max(20, Math.min(200, level + (rand() - 0.42) * 34));
    const close = level;
    const high = Math.max(open, close) + rand() * 14;
    const low = Math.max(8, Math.min(open, close) - rand() * 14);
    return { x: 14 + i * 25, open, close, high, low, up: close >= open };
  });
}

const heroBars = seededBars(23, 42);

function HeroCandlesticks({ reduced }: { reduced: boolean }) {
  return (
    <svg
      className="hero-candles"
      viewBox="0 0 600 230"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
    >
      {heroBars.map((b, i) => {
        const top = Math.min(b.open, b.close);
        const h = Math.max(3, Math.abs(b.close - b.open));
        const color = b.up ? 'rgba(245, 197, 24, 0.85)' : 'rgba(167, 139, 250, 0.8)';
        return (
          <g key={i}>
            <motion.line
              x1={b.x + 5} x2={b.x + 5}
              y1={230 - b.high} y2={230 - b.low}
              stroke={color} strokeWidth={1}
              initial={reduced ? { opacity: 0.35 } : { opacity: 0 }}
              animate={{ opacity: 0.35 }}
              transition={{ delay: reduced ? 0 : 0.5 + i * 0.045, duration: 0.4 }}
            />
            <motion.rect
              x={b.x} y={230 - top - h}
              width={10} height={h} rx={1.5}
              fill={color}
              style={reduced ? undefined : { transformBox: 'fill-box', transformOrigin: 'bottom' }}
              initial={reduced ? { opacity: 0.8, scaleY: 1 } : { opacity: 0.8, scaleY: 0 }}
              animate={{ opacity: 0.8, scaleY: 1 }}
              transition={reduced ? { duration: 0.3, delay: i * 0.02 } : { delay: 0.45 + i * 0.045, duration: 0.5, ease: [0.21, 0.6, 0.35, 1] }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Upward gold arrow that draws itself in after the chart bars finish. */
function HeroArrow({ reduced }: { reduced: boolean }) {
  return (
    <svg className="hero-arrow" viewBox="0 0 220 190" aria-hidden>
      <motion.path
        d="M12 176 C 66 168, 108 132, 128 92 C 142 62, 150 40, 152 22"
        fill="none"
        stroke="url(#heroArrowGrad)"
        strokeWidth={5}
        strokeLinecap="round"
        initial={reduced ? { pathLength: 1, opacity: 0.9 } : { pathLength: 0, opacity: 0.9 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        transition={reduced ? { duration: 0.3 } : { delay: 1.7, duration: 1.4, ease: 'easeInOut' }}
      />
      <motion.path
        d="M130 40 L 153 18 L 168 44"
        fill="none"
        stroke="url(#heroArrowGrad)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? { pathLength: 1, opacity: 0.9 } : { pathLength: 0, opacity: 0.9 }}
        animate={{ pathLength: 1, opacity: 0.9 }}
        transition={reduced ? { duration: 0.3 } : { delay: 3.0, duration: 0.45, ease: 'easeOut' }}
      />
      <defs>
        <linearGradient id="heroArrowGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#F5C518" />
          <stop offset="100%" stopColor="#FFD740" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const titleLine = {
  hidden: { opacity: 0, y: 44 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.16, duration: 0.75, ease: [0.21, 0.6, 0.35, 1] as const },
  }),
};

function HeroSection() {
  const reduced = useReducedMotion() ?? false;

  return (
    <section className="hero hero-v2">
      <div className="hero-bg" aria-hidden />
      <div className="hero-bg-overlay" aria-hidden />
      <HeroParticles />
      <HeroCandlesticks reduced={reduced} />
      <HeroArrow reduced={reduced} />

      <div className="container hero-inner">
        <h1 className="hero-title">
          <motion.span
            className="hero-line"
            variants={titleLine}
            initial="hidden"
            animate="visible"
            custom={0}
          >
            Outperform Inflation with
          </motion.span>{' '}
          <motion.span
            className="hero-line hero-accent"
            variants={titleLine}
            initial="hidden"
            animate="visible"
            custom={1}
          >
            Algorithmic Crypto Strategies.
          </motion.span>
        </h1>
        <motion.p
          className="hero-subtitle"
          initial={reduced ? undefined : { opacity: 0, y: 26 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.7, ease: 'easeOut' }}
        >
          We manage digital asset portfolios using quantitative models, deep liquidity, and
          military-grade cold storage. Built for accredited investors seeking non-correlated
          returns.
        </motion.p>
        <motion.div
          className="hero-actions"
          initial={reduced ? undefined : { opacity: 0, y: 26 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.7, ease: 'easeOut' }}
        >
          <Magnetic strength={12}>
            <Link to="/strategies" className="btn btn-primary btn-lg btn-sheen">
              View Our Strategy <ArrowRight size={18} />
            </Link>
          </Magnetic>
          <Magnetic strength={12}>
            <Link to="/whitepaper" className="btn btn-outline-light btn-lg btn-sheen">
              Read the White Paper
            </Link>
          </Magnetic>
        </motion.div>
      </div>
    </section>
  );
}

function ProofBar() {
  return (
    <section className="proof-bar">
      <div className="container proof-bar-inner">
        {proofBarItems.map((item, idx) => (
          <Reveal className="proof-item" key={idx} delay={idx * 0.14}>
            <item.icon size={18} />
            <span>{item.text}</span>
            {item.text === '24/7 Risk Monitoring' && <span className="proof-dot" aria-hidden />}
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function DepositPlansSection() {
  return (
    <section className="section deposit-plans-section">
      <div className="container">
        <Reveal className="text-center mb-4">
          <span className="eyebrow">Investment Plans</span>
          <h2 className="section-title">Available Deposit Plans</h2>
          <p className="section-subtitle" style={{ margin: '0 auto', textAlign: 'center' }}>
            Transparent, structured deposit plans with fixed daily accruals and working-day
            durations across every tier.
          </p>
        </Reveal>

        <div className="deposit-plans-grid">
          {depositPlans.map((p, idx) => (
            <Reveal key={p.name} delay={idx * 0.09}>
              <TiltCard
                className={`card deposit-plan-card ${p.name === 'Diamond' ? 'deposit-plan-featured' : ''}`}
              >
                <span className="deposit-plan-rank" aria-hidden>{p.rank}</span>
                <h3 className="deposit-plan-name">{p.name} Plan</h3>
                <div className="deposit-plan-accrual">
                  <span className="deposit-plan-accrual-value">
                    <CountUp end={p.dailyValue} duration={1.8} suffix="%" enableScrollSpy scrollSpyOnce />
                  </span>
                  <span className="deposit-plan-accrual-label">Daily Accrual</span>
                </div>
                <ul className="deposit-plan-facts">
                  <li>
                    <span>Deposit</span>
                    <strong>{p.deposit}</strong>
                  </li>
                  <li>
                    <span>Duration</span>
                    <strong>{p.duration}</strong>
                  </li>
                </ul>
              </TiltCard>
            </Reveal>
          ))}
        </div>

        <Reveal className="deposit-plans-note">
          ✅ Withdrawals are available Monday to Friday for all plans.
        </Reveal>
      </div>
    </section>
  );
}

/* ================= FEES ================= */

/** Illustrative fee-split donut: builds itself when scrolled into view. */
function FeeRing() {
  const C = 2 * Math.PI * 54; // circumference for r=54
  const perf = C * 0.15;      // 15% performance fee (gold)
  const mgmt = C * 0.015;     // 1.5% management fee (purple)
  return (
    <svg className="fee-ring" viewBox="0 0 140 140" aria-hidden>
      <circle cx="70" cy="70" r="54" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={12} />
      <motion.circle
        cx="70" cy="70" r="54" fill="none"
        stroke="var(--gold)" strokeWidth={12} strokeLinecap="round"
        strokeDasharray={`${perf} ${C - perf}`}
        transform="rotate(-90 70 70)"
        initial={{ strokeDashoffset: perf }}
        whileInView={{ strokeDashoffset: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1.4, ease: 'easeOut', delay: 0.2 }}
      />
      <motion.circle
        cx="70" cy="70" r="54" fill="none"
        stroke="var(--purple-light)" strokeWidth={12} strokeLinecap="round"
        strokeDasharray={`${mgmt} ${C - mgmt}`}
        transform={`rotate(${-90 + (0.15 * 360) + 2} 70 70)`}
        initial={{ strokeDashoffset: mgmt }}
        whileInView={{ strokeDashoffset: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: 'easeOut', delay: 1.2 }}
      />
      <text x="70" y="66" textAnchor="middle" fill="var(--white)" fontSize="15" fontWeight={700}>83.5%</text>
      <text x="70" y="84" textAnchor="middle" fill="var(--gray-500)" fontSize="9">to investors</text>
    </svg>
  );
}

function FeesTeaser() {
  return (
    <section className="section fees-teaser">
      <div className="container">
        <div className="fees-teaser-inner">
          <Reveal direction="left">
            <span className="eyebrow">Full Fee Transparency</span>
            <h2 className="section-title" style={{ color: 'var(--white)' }}>
              We Hate Hidden Fees.
            </h2>
            <p className="fees-teaser-text">
              1.5% management fee. 15% performance fee, only when we beat the benchmark —
              with a High Water Mark. No entry fees. No load fees. $0 withdrawal fee.
            </p>
            <Magnetic strength={10}>
              <Link to="/fees" className="btn btn-primary mt-3 btn-sheen">
                See the Full Fee Schedule <ArrowRight size={16} />
              </Link>
            </Magnetic>
          </Reveal>
          <Reveal direction="right" delay={0.16}>
            <TiltCard className="card fees-teaser-card" max={6}>
              <div className="fee-card-row">
                <Wallet size={20} />
                <div>
                  <strong><CountUp end={1.5} decimals={1} duration={1.6} suffix="% p.a." enableScrollSpy scrollSpyOnce /></strong>
                  <span>Management Fee</span>
                </div>
              </div>
              <div className="fee-card-row">
                <LineChart size={20} />
                <div>
                  <strong><CountUp end={15} duration={1.6} suffix="% of profits" enableScrollSpy scrollSpyOnce /></strong>
                  <span>Performance Fee (HWM applies)</span>
                </div>
              </div>
              <div className="fee-card-row">
                <FileText size={20} />
                <div>
                  <strong><CountUp end={0} duration={1.2} prefix="$" enableScrollSpy scrollSpyOnce /></strong>
                  <span>Withdrawal & Entry Fees</span>
                </div>
              </div>
              <div className="fee-ring-wrap">
                <FeeRing />
              </div>
            </TiltCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ================= DASHBOARD (pinned GSAP sequence) ================= */

/** Simulated live-feed number: small random walk, pauses for reduced motion. */
function LiveTicker() {
  const reduced = useReducedMotion() ?? false;
  const [value, setValue] = useState(12847.32);
  const [dir, setDir] = useState(1);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      setValue((v) => {
        const delta = (Math.random() - 0.44) * 24;
        setDir(delta >= 0 ? 1 : -1);
        return Math.max(0, v + delta);
      });
    }, 1400);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    <div className="live-ticker" data-cursor="hover">
      <TrendingUp size={13} />
      <span className="live-ticker-label">Live</span>
      <strong>${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
      <span className={`live-ticker-delta ${dir >= 0 ? 'pos' : 'neg'}`}>{dir >= 0 ? '▲' : '▼'}</span>
    </div>
  );
}

/** Flat dashboard mockup that parallaxes while the section is pinned. */
function DashMockup() {
  return (
    <div className="dash-mockup" aria-hidden>
      <div className="dash-mockup-head">
        <span /><span /><span />
      </div>
      <div className="dash-mockup-body">
        <div className="dash-mockup-kpi" />
        <div className="dash-mockup-kpi" />
        <div className="dash-mockup-kpi" />
        <div className="dash-mockup-chart">
          {[38, 62, 45, 78, 56, 88, 70].map((h, i) => (
            <span key={i} style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardFeatures() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    if (reduced) return;
    const el = sectionRef.current;
    if (!el) return;

    // Pinned scrub sequence on desktop; cards cascade in one at a time while
    // the mockup tilts into place. Mobile/reduced-motion → static grid.
    const mm = gsap.matchMedia();
    mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: '+=1600',
          pin: true,
          scrub: 0.6,
        },
      });
      tl.from('.dash-mockup', { rotateX: 16, y: 48, opacity: 0, duration: 0.6 }, 0)
        .from('.feature-card', { y: 64, opacity: 0, stagger: 0.35, duration: 0.5, ease: 'power2.out' }, 0.25);
    });
    return () => mm.revert();
  }, [reduced]);

  return (
    <section className="section dash-features" ref={sectionRef}>
      <div className="container">
        <div className="text-center mb-4">
          <span className="eyebrow">Client Dashboard</span>
          <h2 className="section-title">Institutional-Grade Investor Experience</h2>
          <p className="section-subtitle" style={{ margin: '0 auto', textAlign: 'center' }}>
            The dashboard is designed around one principle: total visibility into your capital.
          </p>
        </div>

        <DashMockup />

        <div className="grid-3">
          {dashboardFeatures.map((f, idx) => (
            <div className="card feature-card" key={f.title}>
              <span className="feature-icon">
                <f.icon size={22} />
              </span>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-text">{f.text}</p>
              {idx === 0 && <LiveTicker />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= FAQ (animated accordion) ================= */

function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const reduced = useReducedMotion() ?? false;

  return (
    <section className="section" style={{ background: 'var(--bg-deep)' }}>
      <div className="container">
        <Reveal className="text-center mb-5">
          <span className="eyebrow">FAQ</span>
          <h2 className="section-title">Straight Answers to Your Questions</h2>
          <p className="section-subtitle" style={{ margin: '0 auto' }}>
            Transparency isn't just about fees — it's about giving you clarity before you invest.
          </p>
        </Reveal>

        <div
          style={{
            maxWidth: '820px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {faqs.map((faq, idx) => {
            const open = openIdx === idx;
            return (
              <div
                key={idx}
                className="card faq-item"
                style={{
                  padding: '20px 24px',
                  cursor: 'pointer',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
                onClick={() => setOpenIdx(open ? null : idx)}
                role="button"
                aria-expanded={open}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenIdx(open ? null : idx);
                  }
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontWeight: 600,
                    fontSize: '16px',
                    color: 'var(--white)',
                  }}
                >
                  {faq.q}
                  <motion.span
                    className="faq-plus"
                    style={{ fontSize: '20px', color: 'var(--gold)', marginLeft: '16px', display: 'inline-block' }}
                    animate={{ rotate: open ? 45 : 0 }}
                    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 22 }}
                  >
                    +
                  </motion.span>
                </div>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={reduced ? { opacity: 1 } : { height: 0, opacity: 0 }}
                      animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                      exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: reduced ? 0.15 : 0.35, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <p
                        style={{
                          marginTop: '16px',
                          paddingTop: '16px',
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                          color: 'rgba(255,255,255,0.75)',
                          fontSize: '15px',
                          lineHeight: '1.7',
                        }}
                      >
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <p style={{ textAlign: 'center', marginTop: '32px', fontSize: '14px', color: 'var(--gray-500)' }}>
          Still have questions? Reach out to us during the due diligence process.
        </p>
      </div>
    </section>
  );
}

/* ================= FINAL CTA (liquid gold background) ================= */

function CtaSection() {
  const reduced = useReducedMotion() ?? false;
  return (
    <section className="section cta-section">
      <div className={`cta-liquid ${reduced ? 'cta-liquid-static' : ''}`} aria-hidden />
      <div className="container text-center">
        <Reveal>
          <h2 className="section-title" style={{ color: 'var(--white)' }}>
            Begin the Due Diligence Process
          </h2>
        </Reveal>
        <Reveal delay={0.12}>
          <p className="cta-text">
            We are accepting a limited number of accredited investors into our closed beta.
            Request the white paper to begin.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="cta-actions">
            <Magnetic strength={12}>
              <Link to="/whitepaper" className="btn btn-primary btn-lg btn-sheen">
                Read the White Paper <ArrowRight size={18} />
              </Link>
            </Magnetic>
            <Magnetic strength={12}>
              <Link to="/about" className="btn btn-outline-light btn-lg btn-sheen">
                Meet the Firm
              </Link>
            </Magnetic>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ProofBar />
      <DepositPlansSection />
      <FeesTeaser />
      <DashboardFeatures />
      <FaqSection />
      <CtaSection />
    </>
  );
}
