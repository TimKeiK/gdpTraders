import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Receipt, ShieldCheck, FileBarChart, MessagesSquare, LogOut, ArrowLeft, User, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './DashboardLayout.css';

const navItems = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/deposit', label: 'Deposit', icon: Plus },
  { to: '/dashboard/transactions', label: 'Transactions', icon: Receipt },
  { to: '/dashboard/security', label: 'Security', icon: ShieldCheck },
  { to: '/dashboard/tax', label: 'Tax Reporting', icon: FileBarChart },
  { to: '/dashboard/support', label: 'Support', icon: MessagesSquare },
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
      <aside className="dash-sidebar">
        <div className="dash-user-header">
          <div className="dash-user-avatar">
            <User size={20} />
          </div>
          <div className="dash-user-info">
            <span className="dash-user-name">Welcome, {firstName}</span>
            <span className="dash-user-email">{user?.email}</span>
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
          <Link to="/" className="dash-nav-link">
            <ArrowLeft size={18} /> Back to Site
          </Link>
          <button className="dash-nav-link" onClick={handleLogout}>
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      <main className="dash-main">
        <Outlet />
      </main>
    </div>
  );
}