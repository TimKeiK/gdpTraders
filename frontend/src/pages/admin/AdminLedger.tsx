import { useEffect, useState } from 'react';
import { BookOpen, ShieldCheck, ShieldAlert, AlertCircle, CheckCircle } from 'lucide-react';
import { adminApi, formatCurrency, type LedgerEntryView } from '../../api/client';
import './admin.css';

const TYPE_PILL: Record<string, string> = {
  deposit: 'pill-green',
  withdrawal: 'pill-red',
  trade: 'pill-purple',
  fee: 'pill-amber',
  interest: 'pill-gray',
  profit: 'pill-green',
  loss: 'pill-red',
};

export default function AdminLedger() {
  const [entries, setEntries] = useState<LedgerEntryView[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [integrity, setIntegrity] = useState<{ valid: boolean; checked: number } | null>(null);

  const load = () => {
    adminApi
      .getLedger()
      .then((d) => {
        setEntries(d);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load ledger'));
  };

  useEffect(load, []);

  const verify = async () => {
    setBusy(true);
    setMsg('');
    setError('');
    try {
      const r = await adminApi.verifyLedger();
      setIntegrity(r);
      setMsg(
        r.valid
          ? `Ledger integrity verified — ${r.checked} entries intact.`
          : `Ledger integrity check FAILED after ${r.checked} entries!`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="admin-title">Ledger</h1>
      <p className="admin-subtitle">
        Append-only, hash-chained financial ledger. Every deposit, withdrawal, trade, and fee is immutable.
      </p>

      {error && <div className="admin-msg err"><AlertCircle size={16} /> {error}</div>}
      {msg && (
        <div className={`admin-msg ${integrity?.valid ? 'ok' : 'err'}`}>
          {integrity?.valid ? <CheckCircle size={16} /> : <ShieldAlert size={16} />} {msg}
        </div>
      )}

      <div className="admin-toolbar">
        <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
          <BookOpen size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          {entries.length} ledger entries
        </div>
        <button className="admin-btn primary" onClick={verify} disabled={busy}>
          <ShieldCheck size={16} /> {busy ? 'Verifying…' : 'Verify Ledger Integrity'}
        </button>
      </div>

      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Reference</th>
                <th>Date</th>
                <th>Integrity Hash</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr><td colSpan={8} className="admin-empty">Ledger is empty.</td></tr>
              )}
              {entries.slice().reverse().map((e) => (
                <tr key={e.id}>
                  <td className="mono">{e.id}</td>
                  <td className="mono">{e.userId}</td>
                  <td><span className={`admin-pill ${TYPE_PILL[e.entryType] || 'pill-gray'}`}>{e.entryType}</span></td>
                  <td>{e.asset}</td>
                  <td><strong className={e.amount < 0 ? 'neg' : 'pos'}>{formatCurrency(e.amount)}</strong></td>
                  <td className="mono">{e.referenceId}</td>
                  <td className="mono">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="mono" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.integrityHash}>
                    {e.integrityHash.slice(0, 18)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
