/**
 * AdminRoute — protects admin routes.
 * Only users with role 'admin' or 'compliance' may access the Admin Portal.
 * Redirects clients back to their dashboard.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AdminRoute() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          border: '3px solid rgba(239, 68, 68, 0.2)',
          borderTopColor: 'var(--red)',
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite',
        }}></div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Non-staff users cannot open the Admin Portal.
  if (user && user.role !== 'admin' && user.role !== 'compliance') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
