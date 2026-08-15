import { useState, type FormEvent } from 'react';
import { Send, Lock, User, Clock } from 'lucide-react';
import './DashboardPages.css';

const cases = [
  { title: 'European Family Office', text: 'Allocated 5% of portfolio to our Arbitrage Alpha strategy to hedge against equity market drawdowns.' },
  { title: 'Southeast Asian HNW Individual', text: 'Migrated a legacy exchange-held allocation into cold storage custody with structured reporting.' },
  { title: 'Middle Eastern Investment Firm', text: 'Deployed stablecoin treasury into DeFi Treasury for low-volatility yield on idle cash.' },
];

export default function SupportPage() {
  const [sent, setSent] = useState(false);

  const submit = (e: FormEvent) => { e.preventDefault(); setSent(true); };

  return (
    <>
      <h1 className="dash-title">Secure Client Support</h1>
      <p className="dash-last-updated">
        In-app messaging with your dedicated Account Executive — not a bot. End-to-end encrypted.
      </p>

      <div className="dash-kpis">
        <div className="card kpi-card">
          <span className="kpi-icon"><User size={20} /></span>
          <span className="kpi-label">Account Executive</span>
          <strong className="kpi-value" style={{ fontSize: 18 }}>Dedicated Contact</strong>
        </div>
        <div className="card kpi-card">
          <span className="kpi-icon"><Clock size={20} /></span>
          <span className="kpi-label">Response Time</span>
          <strong className="kpi-value" style={{ fontSize: 18 }}>Within 2h</strong>
        </div>
        <div className="card kpi-card">
          <span className="kpi-icon"><Lock size={20} /></span>
          <span className="kpi-label">Security</span>
          <strong className="kpi-value" style={{ fontSize: 18 }}>E2E Encrypted</strong>
        </div>
      </div>

      <div className="card mt-3">
        <h2 className="dash-section-title">Send a Secure Message</h2>
        {sent ? (
          <div>
            <p><strong>Message sent.</strong> Your Account Executive will respond within 2 business hours.</p>
            <button className="btn btn-outline btn-sm mt-3" onClick={() => setSent(false)}>Send Another</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Subject</label>
              <input className="form-control" required placeholder="e.g. Withdrawal request, performance question" />
            </div>
            <div className="form-group">
              <label>Message</label>
              <textarea className="form-control" rows={5} required placeholder="How can we help?" />
            </div>
            <button type="submit" className="btn btn-primary"><Send size={16} /> Send Securely</button>
          </form>
        )}
      </div>

      <div className="card mt-3">
        <h2 className="dash-section-title">Anonymized Case Studies</h2>
        <p className="sec-sub" style={{ marginBottom: 16 }}>
          Real allocations, anonymized with permission. Names and amounts withheld to protect client privacy.
        </p>
        <div className="support-cases">
          {cases.map((c) => (
            <div className="support-case" key={c.title}>
              <span className="sec-icon"><User size={18} /></span>
              <div>
                <strong>{c.title}</strong>
                <p>{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}