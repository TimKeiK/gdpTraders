import { useEffect, useState } from 'react';
import { ScrollText, AlertCircle } from 'lucide-react';
import { adminApi, type AuditLogEntryView } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './admin.css';

const ACTION_PILL: Record<string, string> = {
  ACCOUNT_CREATED: 'pill-green',
  KYC_SUBMITTED: 'pill-amber',
  KYC_APPROVED: 'pill-green',
  KYC_STATUS_CHANGED: 'pill-amber',
  DEPOSIT: 'pill-green',
  DEPOSIT_CONFIRMED: 'pill-green',
  DEPOSIT_DENIED: 'pill-red',
  DEPOSIT_SUBMITTED: 'pill-purple',
  ADMIN_DEPOSIT: 'pill-green',
  WITHDRAWAL_REQUESTED: 'pill-amber',
  WITHDRAWAL_APPROVAL: 'pill-purple',
  WITHDRAWAL_EXECUTED: 'pill-red',
  ROLE_CHANGED: 'pill-red',
  LEDGER_VERIFY: 'pill-gray',
  SECURITY_CHECK: 'pill-gray',
};

export default function AdminAuditLogs() {
  const { user: me } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntryView[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi
      .getAuditLogs()
      .then((d) => {
        setLogs(d);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load audit logs'));
  }, []);

  return (
    <>
      <h1 className="admin-title">Audit Logs</h1>
      <p className="admin-subtitle">
        Immutable record of every significant action taken on the platform. Signed in as {me?.email}.
      </p>

      {error && <div className="admin-msg err"><AlertCircle size={16} /> {error}</div>}

      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User ID</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr><td colSpan={4} className="admin-empty">No audit entries yet.</td></tr>
              )}
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="mono">{l.userId}</td>
                  <td><span className={`admin-pill ${ACTION_PILL[l.action] || 'pill-gray'}`}>{l.action}</span></td>
                  <td>{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logs.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, fontSize: 12.5, color: 'var(--gray-400)' }}>
            <ScrollText size={14} /> {logs.length} entries · newest first
          </div>
        )}
      </div>
    </>
  );
}
