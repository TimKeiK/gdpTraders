import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Menu, X, Bitcoin } from 'lucide-react';
import Magnetic from './motion/Magnetic';
import './Navbar.css';

const navItems = [
  { label: 'Strategies', to: '/strategies' },
  { label: 'Fees', to: '/fees' },
  { label: 'About', to: '/about' },
  { label: 'White Paper', to: '/whitepaper' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  // Blur + shrink after ~50px of scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
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

        <nav
          className={`navbar-links ${open ? 'open' : ''}`}
          onMouseLeave={() => setHoveredLink(null)}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `navbar-link ${isActive ? 'active' : ''}`
              }
              onClick={() => setOpen(false)}
              onMouseEnter={() => setHoveredLink(item.to)}
            >
              {({ isActive }) => {
                const showUnderline = hoveredLink ? hoveredLink === item.to : isActive;
                return (
                  <>
                    {item.label}
                    {/* Animated underline slides smoothly between links on hover/active (shared layout). */}
                    {showUnderline && (
                      <motion.span
                        layoutId="navbar-underline"
                        className="navbar-underline"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                  </>
                );
              }}
            </NavLink>
          ))}
          <Magnetic strength={10}>
            <Link to="/signup" className="btn btn-outline-light btn-sm navbar-cta navbar-cta-secondary" onClick={() => setOpen(false)}>
              Create Account
            </Link>
          </Magnetic>
          <Magnetic strength={10}>
            <Link to="/login" className="btn btn-primary btn-sm navbar-cta" onClick={() => setOpen(false)}>
              Login
            </Link>
          </Magnetic>
        </nav>
      </div>
    </header>
  );
}
