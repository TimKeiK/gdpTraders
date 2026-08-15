import { Link } from 'react-router-dom';
import { Lock, ShieldCheck, Users, ArrowRight, Brain, LineChart } from 'lucide-react';
import './AboutPage.css';

const values = [
  { icon: Brain, title: 'Quants, Not Salespeople', text: 'Our team is built from quantitative researchers and engineers who have spent their careers in HFT and digital asset infrastructure.' },
  { icon: ShieldCheck, title: 'Privacy by Design', text: 'We maintain operational privacy for on-the-ground staff to mitigate social engineering and targeting risk.' },
  { icon: LineChart, title: 'Data Over Hype', text: 'We publish real performance against benchmarks — never fabricated numbers or placeholder stats.' },
];

export default function AboutPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">About Us</span>
          <h1 className="page-hero-title">We Are Quants and Engineers.</h1>
          <p className="page-hero-subtitle">
            GDPTraders is operated by a core team of quantitative researchers and fintech engineers
            with backgrounds in high-frequency trading and institutional digital asset custody.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="about-grid">
            <div>
              <h2 className="section-title">Our Philosophy</h2>
              <p className="about-text">
                We maintain operational privacy for on-the-ground staff to mitigate social
                engineering and targeting risk. Full bios, CVs, and track records of our
                Portfolio Managers are shared directly with prospective investors during the
                private due diligence process, after a standard NDA.
              </p>
              <p className="about-text">
                Custody, execution, and legal infrastructure partners will be named here once
                formally contracted and confirmed in writing.
              </p>

              <div className="about-note card">
                <Lock size={20} />
                <p>
                  <strong>Privacy-First Transparency:</strong> We will not publish names or
                  credentials — real or invented — until they are true and confirmed. Real staff
                  who agree to be public-facing can be added later with real headshots and bios.
                </p>
              </div>
            </div>

            <div>
              <h2 className="section-title">Due Diligence</h2>
              <div className="about-steps">
                <div className="about-step">
                  <span className="about-step-num">01</span>
                  <div>
                    <strong>Request a Data Room</strong>
                    <p>Begin by reading the white paper and requesting access to our secure data room.</p>
                  </div>
                </div>
                <div className="about-step">
                  <span className="about-step-num">02</span>
                  <div>
                    <strong>Sign an NDA</strong>
                    <p>Full team bios, track records, and backtested strategy data are shared under NDA.</p>
                  </div>
                </div>
                <div className="about-step">
                  <span className="about-step-num">03</span>
                  <div>
                    <strong>Private Review</strong>
                    <p>Meet the team, review the infrastructure, and complete your own diligence.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="values-grid mt-5">
            {values.map((v) => (
              <div className="card value-card" key={v.title}>
                <span className="value-icon"><v.icon size={22} /></span>
                <h3>{v.title}</h3>
                <p>{v.text}</p>
              </div>
            ))}
          </div>

          <div className="about-cta card mt-5">
            <div>
              <h3><Users size={20} /> Begin Your Due Diligence</h3>
              <p>Our team is available to accredited investors who complete the white paper request.</p>
            </div>
            <Link to="/whitepaper" className="btn btn-primary">
              Read the White Paper <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}