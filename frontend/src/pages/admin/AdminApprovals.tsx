import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  AlertCircle,
  UserCheck,
} from 'lucide-react';
import { adminApi, formatCurrency, type Transaction } from '../../api/client';
import './admin.css';

export default function AdminApprovals() {
  const [items, setItems] = useState<Transaction[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = () => {
    adminApi
      .getWithdrawals()
      .then((d) => {
        setItems(d);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load withdrawals'));
  };

  useEffect(load, []);

  const approve = async (t: Transaction) => {
    if (busyId) return;
    setBusyId(t.id);
    setMsg('');
    setError('');
    try {
      const r = await adminApi.approveWithdrawal(t.id);
      setMsg(r.message);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to approve');
    } finally {
      setBusyId('');
    }
  };

  const signCount = (t: Transaction) => (t.approval1 ? 1 : 0) + (t.approval2 ? 1 : 0);
  const active = items.filter((t) => t.status === 'Pending');

  return (
    <>
      <h1 className="admin-title">Approvals</h1>
      <p className="admin-subtitle">
        Multi-signature withdrawal approvals. Both an admin and a compliance officer must sign to execute.
      </p>

      {error && <div className="admin-msg err"><AlertCircle size={16} /> {error}</div>}
      {msg && <div className="admin-msg ok"><CheckCircle size={16} /> {msg}</div>}

      <div className="admin-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="admin-kpi red">
          <div className="admin-kpi-label"><ShieldAlert size={15} /> Pending Withdrawals</div>
          <div className="admin-kpi-value">{active.length}</div>
        </div>
        <div className="admin-kpi amber">
          <div className="admin-kpi-label"><ShieldCheck size={15} /> Completed</div>
          <div className="admin-kpi-value">{items.length - active.length}</div>
        </div>
        <div className="admin-kpi purple">
          <div className="admin-kpi-label"><UserCheck size={15} /> Signatures Needed</div>
          <div className="admin-kpi-value">2 / tx</div>
          <div className="admin-kpi-sub">admin + compliance</div>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-section-title">Withdrawal Requests</h2>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Approvals</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={7} className="admin-empty">No withdrawal requests.</td></tr>
              )}
              {items.map((t) => {
                const signed = signCount(t);
                const isComplete = t.status !== 'Pending';
                return (
                  <tr key={t.id}>
                    <td className="mono">{t.id}</td>
                    <td>{t.asset}</td>
                    <td><strong>{formatCurrency(t.amount)}</strong></td>
                    <td className="mono">{new Date(t.date).toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="approval-sig">
                          {Array.from({ length: 2 }).map((_, i) => (
                            <span
                              key={i}
                              className={`approval-dot ${i < signed ? 'signed' : ''}`}
                              title={i < signed ? 'Signed' : 'Awaiting signature'}
                            />
                          ))}
                        </div>
                        <span style={{ fontSize: 12.5, color: 'var(--gray-400)' }}>{signed}/2</span>
                      </div>
                    </td>
                    <td><span className={`admin-pill ${isComplete ? 'pill-green' : 'pill-amber'}`}>{t.status}</span></td>
                    <td>
                      {isComplete ? (
                        <span className="admin-pill pill-green"><CheckCircle size={13} /> Executed</span>
                      ) : (
                        <button className="admin-btn green" onClick={() => approve(t)} disabled={busyId === t.id}>
                          <ShieldCheck size={14} /> {busyId === t.id ? 'Signing…' : 'Approve'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
