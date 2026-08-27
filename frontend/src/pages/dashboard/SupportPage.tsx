import { useState, type FormEvent } from 'react';
import { Send, Lock, User, Clock } from 'lucide-react';
import './DashboardPages.css';

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
          <strong className="kpi-value" style={{ fontSize: 18 }}>Within 1 hr</strong>
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
            <p><strong>Message sent.</strong> Your message has been sent to gdpsupport@gmail.com. Your Account Executive will respond within 1 hour.</p>
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


    </>
  );
}