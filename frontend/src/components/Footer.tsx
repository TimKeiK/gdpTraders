import { Link } from 'react-router-dom';
import { Bitcoin, Mail, Phone, MapPin } from 'lucide-react';
import './Footer.css';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        {/* Brand + quick links */}
        <div className="footer-top">
          <div className="footer-brand">
            <span className="footer-logo">
              <Bitcoin size={20} />
            </span>
            <span className="footer-name">
              GDP<span className="footer-name-accent">Traders</span>
            </span>
            <p className="footer-tagline">
              Institutional-grade crypto wealth management.
              Built for accredited investors seeking non-correlated returns.
            </p>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Platform</h4>
            <Link to="/strategies" className="footer-link">Strategies</Link>
            <Link to="/fees" className="footer-link">Fee Schedule</Link>
            <Link to="/whitepaper" className="footer-link">White Paper</Link>
            <Link to="/login" className="footer-link">Login</Link>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Company</h4>
            <Link to="/about" className="footer-link">About Us</Link>
            <Link to="/about" className="footer-link">Due Diligence</Link>
            <Link to="/whitepaper" className="footer-link">Security & Audit</Link>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Contact</h4>
            <p className="footer-contact">
              <MapPin size={14} /> [Insert Verifiable Physical Address]
            </p>
            <p className="footer-contact">
              <Phone size={14} /> +1 (XXX) XXX-XXXX
            </p>
            <p className="footer-contact">
              <Mail size={14} /> [Contact email]
            </p>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} GDPTraders. All rights reserved.</p>
          <p className="footer-withdrawals">
            Withdrawals: 1–3 business days (fiat) · Instant (crypto to whitelisted wallets)
          </p>
        </div>
      </div>
    </footer>
  );
}