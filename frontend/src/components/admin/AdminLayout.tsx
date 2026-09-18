import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Receipt,
  ShieldCheck,
  BookOpen,
  ScrollText,
  LogOut,
  ExternalLink,
  ShieldAlert,
  Settings,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AdminNotifications from './AdminNotifications';
import './AdminLayout.css';

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/accounts', label: 'Accounts', icon: Users },
  { to: '/admin/transactions', label: 'Transactions', icon: Receipt },
  { to: '/admin/approvals', label: 'Approvals', icon: ShieldCheck },
  { to: '/admin/ledger', label: 'Ledger', icon: BookOpen },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleClientPortal = () => navigate('/dashboard');
  const roleLabel = user?.role === 'compliance' ? 'Compliance' : 'Administrator';

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-logo">
            <ShieldAlert size={20} />
          </div>
          <div className="admin-brand-text">
            <span className="admin-brand-name">GDPTraders</span>
            <span className="admin-brand-sub">Admin Portal</span>
          </div>
        </div>

        <div className="admin-role-pill">
          <span className={`admin-role-dot ${user?.role === 'compliance' ? 'compliance' : ''}`} />
          {roleLabel} Access
        </div>

        <nav className="admin-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="admin-nav-link" onClick={handleClientPortal}>
            <ExternalLink size={18} /> View Client Portal
          </button>
          <button className="admin-nav-link" onClick={handleLogout}>
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <div className="admin-main-inner">
          <div className="admin-topbar">
            <div>
              <div className="admin-topbar-eyebrow">Restricted area · {roleLabel}</div>
              <div className="admin-topbar-user">{user?.email}</div>
            </div>
            <div className="admin-topbar-right">
              <AdminNotifications />
              <span className="admin-live-badge">
                <span className="admin-live-dot" /> LIVE SYSTEM DATA
              </span>
            </div>
          </div>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
