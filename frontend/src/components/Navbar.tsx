import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X, Bitcoin } from 'lucide-react';
import './Navbar.css';

const navItems = [
  { label: 'Strategies', to: '/strategies' },
  { label: 'Fees', to: '/fees' },
  { label: 'About', to: '/about' },
  { label: 'White Paper', to: '/whitepaper' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand" onClick={() => setOpen(false)}>
          <span className="navbar-logo">
            <Bitcoin size={22} />
          </span>
          <span className="navbar-name">
            GDP<span className="navbar-name-accent">Traders</span>
          </span>
          </Link>

        <button
          className="navbar-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle navigation"
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>

        <nav className={`navbar-links ${open ? 'open' : ''}`}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `navbar-link ${isActive ? 'active' : ''}`
              }
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
          <Link to="/signup" className="btn btn-outline-light btn-sm navbar-cta navbar-cta-secondary" onClick={() => setOpen(false)}>
            Create Account
          </Link>
          <Link to="/login" className="btn btn-primary btn-sm navbar-cta" onClick={() => setOpen(false)}>
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}