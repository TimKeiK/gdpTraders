import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './styles/index.css';

// Auth
import { AuthProvider } from './contexts/AuthContext';
import AuthRoute from './components/AuthRoute';

// Layout
import Layout from './components/Layout';

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
import DashboardLayout from './components/dashboard/DashboardLayout';
import OverviewPage from './pages/dashboard/OverviewPage';
import DepositPage from './pages/dashboard/DepositPage';
import TransactionsPage from './pages/dashboard/TransactionsPage';
import SecurityPage from './pages/dashboard/SecurityPage';
import TaxPage from './pages/dashboard/TaxPage';
import SupportPage from './pages/dashboard/SupportPage';

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

          {/* Protected dashboard routes — requires authenticated session */}
          <Route element={<AuthRoute />}>
            <Route path="dashboard" element={<DashboardLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="deposit" element={<DepositPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="tax" element={<TaxPage />} />
              <Route path="support" element={<SupportPage />} />
            </Route>
          </Route>

          <Route path="*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
