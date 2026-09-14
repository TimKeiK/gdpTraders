import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, MessagesSquare, LogOut, User, Plus, ArrowDownToLine, Bitcoin, Gift } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import TidioChat from '../TidioChat';
import NotificationCenter from './NotificationCenter';
import './DashboardLayout.css';

  const navItems: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; sidebarOnly?: boolean }[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/deposit', label: 'Deposit', icon: Plus },
  { to: '/dashboard/withdraw', label: 'Withdraw', icon: ArrowDownToLine },
  { to: '/dashboard/transactions', label: 'Transactions', icon: Receipt },
  // Referrals sits right after Transactions (near money-movement pages; reorder freely).
  { to: '/dashboard/referrals', label: 'Referrals', icon: Gift },
  { to: '/dashboard/support', label: 'Support', icon: MessagesSquare },
  // Profile is now in the mobile bottom nav (was sidebarOnly before, which hid it on
  // small screens). It stays in the sidebar too, so on desktop the sidebar link wins
  // the `active` highlight and the bottom nav is simply not rendered there.
  { to: '/dashboard/profile', label: 'Profile', icon: User },
];

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const firstName = user?.name?.split(' ')[0] || user?.email?.split('@')[0] || 'Investor';

  return (
    <div className="dash-shell">
      {/* Mobile Top Header (only visible on mobile/tablet) */}
      <header className="dash-mobile-header">
        <div className="dash-brand">
          <div className="dash-logo">
            <Bitcoin size={20} />
          </div>
          <span className="dash-brand-text">
            GDP<span className="dash-accent">Traders</span>
          </span>
                </div>
        <div className="dash-mobile-right">
          <span className="dash-mobile-welcome">Welcome, {firstName}</span>
          <button className="dash-mobile-logout" onClick={handleLogout} title="Sign Out" aria-label="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Sidebar (only visible on desktop) */}
      <aside className="dash-sidebar">
        <div className="dash-brand">
          <div className="dash-logo">
            <Bitcoin size={20} />
          </div>
          <span>GDP<span className="dash-accent">Traders</span></span>
        </div>

        <div className="dash-user-header" onClick={() => navigate('/dashboard/profile')} role="button" tabIndex={0} style={{ cursor: 'pointer' }}>
          <div className="dash-user-avatar">
            <User size={20} />
          </div>
          <div className="dash-user-info">
            <span className="dash-user-name">Welcome {firstName}</span>
            <span className="dash-user-sub" style={{ fontSize: 11, color: 'var(--gray-400)' }}>Profile &amp; settings</span>
          </div>
        </div>

        <nav className="dash-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `dash-nav-link ${isActive ? 'active' : ''}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="dash-sidebar-footer">
          <button className="dash-nav-link" onClick={handleLogout}>
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="dash-main">
        <Outlet />
      </main>

      {/* Bottom Navigation Bar (only visible on mobile/tablet) */}
      <nav className="dash-bottom-nav">
        {navItems.filter((i) => !i.sidebarOnly).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `dash-bottom-nav-link ${isActive ? 'active' : ''}`}
          >
            <item.icon size={20} className="dash-bottom-nav-icon" />
            <span className="dash-bottom-nav-label">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      <TidioChat />

      <NotificationCenter />
    </div>
  );
}