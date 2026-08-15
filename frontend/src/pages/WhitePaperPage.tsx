import { FileText, ShieldCheck, Lock, FileBarChart, Send } from 'lucide-react';
import { useState } from 'react';
import './WhitePaperPage.css';

const sections = [
  { title: '1. Executive Summary', text: 'GDPTraders manages institutional-grade digital asset portfolios using systematic quantitative models. Focus: 100% cryptocurrency. No unrelated asset classes.' },
  { title: '2. Investment Philosophy', text: 'We build portfolios that seek non-correlated returns through market-neutral arbitrage, layered staking yields, and volatility-targeted momentum. Data over hype.' },
  { title: '3. Strategy Architecture', text: 'Four strategies — BTC/ETH Core, Arbitrage Alpha, DeFi Treasury, Active Quant — each with defined benchmarks, volatility profiles, and liquidity terms.' },
  { title: '4. Risk Management', text: '24/7 risk monitoring, address whitelisting, multi-signature cold storage, and dynamic volatility targeting.' },
  { title: '5. Fee Structure', text: '1.5% management fee. 15% performance fee with a High Water Mark, charged only when we beat the benchmark. No hidden fees.' },
  { title: '6. Custody & Security', text: 'Military-grade cold storage with multi-signature controls. Custody partners will be named once formally contracted.' },
  { title: '7. Legal & Compliance', text: 'Strictly for Professional/Accredited Investors. Mandatory KYC/AML and Source of Funds verification before any deposit.' },
];

export default function WhitePaperPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">White Paper</span>
          <h1 className="page-hero-title">The GDPTraders White Paper</h1>
          <p className="page-hero-subtitle">
            A detailed overview of our investment process, risk framework, and technology stack.
            Request access to the full document.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="wp-grid">
            <div className="wp-sections">
              <div className="card wp-summary">
                <FileText size={22} />
                <p>
                  The full white paper contains in-depth methodology, backtested results, and
                  technical specifications. It is made available to accredited investors through
                  our secure data-room after verification.
                </p>
              </div>
              {sections.map((s) => (
                <div className="card wp-section" key={s.title}>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              ))}
            </div>

            <div className="wp-side">
              <div className="card wp-request">
                <h3>Request Access</h3>
                <p className="wp-request-sub">
                  Complete the form below to begin verification. Access to the full document is
                  provided after KYC/AML screening.
                </p>

                {submitted ? (
                  <div className="wp-success">
                    <ShieldCheck size={32} />
                    <h4>Request Received</h4>
                    <p>
                      Our onboarding team will contact you within 2 business days to begin the
                      due diligence process.
                    </p>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSubmitted(true);
                    }}
                  >
                    <div className="form-group">
                      <label>Full Name</label>
                      <input className="form-control" required placeholder="Jane Doe" />
                    </div>
                    <div className="form-group">
                      <label>Work Email</label>
                      <input className="form-control" type="email" required placeholder="jane@firm.com" />
                    </div>
                    <div className="form-group">
                      <label>Investor Type</label>
                      <select className="form-control" required defaultValue="">
                        <option value="" disabled>Select investor type</option>
                        <option>Individual Accredited Investor</option>
                        <option>Family Office</option>
                        <option>Institutional Investor</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                      <Send size={16} /> Request the White Paper
                    </button>
                  </form>
                )}

                <div className="wp-security">
                  <Lock size={14} />
                  <span>Your information is encrypted and never shared.</span>
                </div>
              </div>

              <div className="card wp-side-note">
                <FileBarChart size={20} />
                <p>
                  <strong>Data-Room Only:</strong> Backtested performance is shared exclusively
                  through our secure data-room during onboarding — never publicly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}