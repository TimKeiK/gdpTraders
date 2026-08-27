import { useEffect, useState } from 'react';
import {
  Users,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  ShieldCheck,
  AlertTriangle,
  DollarSign,
  Clock,
  Activity,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { adminApi, formatCurrency, type AdminDashboard } from '../../api/client';
import './admin.css';

const STATUS_PILL: Record<string, string> = {
  Completed: 'pill-green',
  Pending: 'pill-amber',
  Processing: 'pill-purple',
};

export default function AdminDashboard() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    adminApi
      .getDashboard()
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading && !data) {
    return <div className="admin-empty">Loading system overview…</div>;
  }

  const s = data?.stats;

  return (
    <>
      <h1 className="admin-title">System Overview</h1>
      <p className="admin-subtitle">
        Live financial and account data across all clients. Everything you need at a glance.
      </p>

      {error && <div className="admin-msg err">⚠ {error}</div>}

      {s && (
        <div className="admin-kpis">
          <div className="admin-kpi purple">
            <div className="admin-kpi-label"><Users size={15} /> Total Users</div>
            <div className="admin-kpi-value">{s.totalUsers}</div>
            <div className="admin-kpi-sub">{s.clients} clients · {s.staff} staff</div>
          </div>

          <div className="admin-kpi green">
            <div className="admin-kpi-label"><TrendingUp size={15} /> Total Profit</div>
            <div className="admin-kpi-value">{formatCurrency(s.totalProfit, true)}</div>
            <div className="admin-kpi-sub">admin credits</div>
          </div>

          <div className="admin-kpi red">
            <div className="admin-kpi-label"><TrendingDown size={15} /> Total Loss</div>
            <div className="admin-kpi-value">{formatCurrency(s.totalLoss, true)}</div>
            <div className="admin-kpi-sub">admin debits</div>
          </div>

          <div className="admin-kpi gold">
            <div className="admin-kpi-label"><Activity size={15} /> Net P&L</div>
            <div className="admin-kpi-value">{formatCurrency(s.netPnl, true)}</div>
            <div className="admin-kpi-sub">profit − loss</div>
          </div>

          <div className="admin-kpi gold">
            <div className="admin-kpi-label"><DollarSign size={15} /> Assets Under Mgt</div>
            <div className="admin-kpi-value">{formatCurrency(s.totalAUM, true)}</div>
            <div className="admin-kpi-sub">derived from ledger</div>
          </div>

          <div className="admin-kpi green">
            <div className="admin-kpi-label"><ArrowDownCircle size={15} /> Total Deposits</div>
            <div className="admin-kpi-value">{formatCurrency(s.completedDeposits, true)}</div>
            <div className="admin-kpi-sub">{s.processingDeposits} pending confirmation</div>
          </div>

          <div className="admin-kpi red">
            <div className="admin-kpi-label"><ArrowUpCircle size={15} /> Total Withdrawals</div>
            <div className="admin-kpi-value">{formatCurrency(s.completedWithdrawals, true)}</div>
            <div className="admin-kpi-sub">{s.pendingWithdrawals} pending (${s.pendingWithdrawalAmount.toLocaleString()})</div>
          </div>

          <div className="admin-kpi amber">
            <div className="admin-kpi-label"><AlertTriangle size={15} /> Pending KYC</div>
            <div className="admin-kpi-value">{s.pendingKyc}</div>
            <div className="admin-kpi-sub">awaiting verification</div>
          </div>

          <div className="admin-kpi red">
            <div className="admin-kpi-label"><Clock size={15} /> Pending Withdrawals</div>
            <div className="admin-kpi-value">{s.pendingWithdrawals}</div>
            <div className="admin-kpi-sub">needs multi-sig approval</div>
          </div>

          <div className="admin-kpi purple">
            <div className="admin-kpi-label"><Receipt size={15} /> Fees Collected</div>
            <div className="admin-kpi-value">{formatCurrency(s.fees, true)}</div>
            <div className="admin-kpi-sub">{s.transactionCount} total transactions</div>
          </div>

          <div className="admin-kpi gold">
            <div className="admin-kpi-label"><Activity size={15} /> Ledger Integrity</div>
            <div className="admin-kpi-value">{s.ledgerEntries}</div>
            <div className="admin-kpi-sub">{s.auditCount} audit entries</div>
          </div>
        </div>
      )}

      <div className="admin-card">
        <h2 className="admin-section-title"><ShieldCheck size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} /> Recent Transactions</h2>
        <p className="admin-section-sub">Latest activity across the platform</p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentTransactions?.length ? (
                data.recentTransactions.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.id}</td>
                    <td>{t.type}</td>
                    <td>{t.asset}</td>
                    <td>{formatCurrency(t.amount)}</td>
                    <td><span className={`admin-pill ${STATUS_PILL[t.status] || 'pill-gray'}`}>{t.status}</span></td>
                    <td className="mono">{new Date(t.date).toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={6} className="admin-empty">No transactions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
