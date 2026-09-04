import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles/index.css';

// Auth
import { AuthProvider } from './contexts/AuthContext';
import AuthRoute from './components/AuthRoute';
import AdminRoute from './components/AdminRoute';

// Layout
import Layout from './components/Layout';
import AdminLayout from './components/admin/AdminLayout';

// Marketing pages
import HomePage from './pages/HomePage';
import StrategiesPage from './pages/StrategiesPage';
import StrategyDetailPage from './pages/StrategyDetailPage';
import FeesPage from './pages/FeesPage';
import AboutPage from './pages/AboutPage';
import WhitePaperPage from './pages/WhitePaperPage';

// Dashboard pages
import LoginPage from './pages/dashboard/LoginPage';
import SignUpPage from './pages/dashboard/SignUpPage';
import VerifyEmailPage from './pages/dashboard/VerifyEmailPage';
import DashboardLayout from './components/dashboard/DashboardLayout';
import OverviewPage from './pages/dashboard/OverviewPage';
import PnlPage from './pages/dashboard/PnlPage';
import ReferralsPage from './pages/dashboard/ReferralsPage';
import DepositPage from './pages/dashboard/DepositPage';
import WithdrawPage from './pages/dashboard/WithdrawPage';
import TransactionsPage from './pages/dashboard/TransactionsPage';
import SecurityPage from './pages/dashboard/SecurityPage';
import ProfileSettingsPage from './pages/dashboard/ProfileSettingsPage';
import TaxPage from './pages/dashboard/TaxPage';
import SupportPage from './pages/dashboard/SupportPage';

// Admin portal pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminAccounts from './pages/admin/AdminAccounts';
import AdminTransactions from './pages/admin/AdminTransactions';
import AdminApprovals from './pages/admin/AdminApprovals';
import AdminLedger from './pages/admin/AdminLedger';
import AdminAuditLogs from './pages/admin/AdminAuditLogs';
import AdminSettings from './pages/admin/AdminSettings';


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="strategies" element={<StrategiesPage />} />
            <Route path="strategies/:id" element={<StrategyDetailPage />} />
            <Route path="fees" element={<FeesPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="whitepaper" element={<WhitePaperPage />} />
          </Route>

          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignUpPage />} />
          <Route path="verify-email" element={<VerifyEmailPage />} />

          {/* Protected dashboard routes — requires authenticated session */}
          <Route element={<AuthRoute />}>
            <Route path="dashboard" element={<DashboardLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="pnl" element={<PnlPage />} />
              <Route path="deposit" element={<DepositPage />} />
              <Route path="withdraw" element={<WithdrawPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="referrals" element={<ReferralsPage />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="profile" element={<ProfileSettingsPage />} />
              <Route path="tax" element={<TaxPage />} />
              <Route path="support" element={<SupportPage />} />
            </Route>
          </Route>

          {/* Admin Portal — restricted to admin & compliance staff */}
          <Route element={<AdminRoute />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="accounts" element={<AdminAccounts />} />
              <Route path="transactions" element={<AdminTransactions />} />
              <Route path="approvals" element={<AdminApprovals />} />
              <Route path="ledger" element={<AdminLedger />} />
              <Route path="audit-logs" element={<AdminAuditLogs />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
          </Route>

          <Route path="*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);