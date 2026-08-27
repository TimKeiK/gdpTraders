import { useEffect, useMemo, useState } from 'react';
import {
  Receipt,
  Search,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { adminApi, formatCurrency, type AdminTransaction } from '../../api/client';
import './admin.css';

const STATUS_PILL: Record<string, string> = {
  Completed: 'pill-green',
  Pending: 'pill-amber',
  Processing: 'pill-purple',
};

const TYPE_PILL: Record<string, string> = {
  Deposit: 'pill-green',
  Withdrawal: 'pill-red',
  Trade: 'pill-purple',
  Fee: 'pill-amber',
  'Performance Fee': 'pill-amber',
};

export default function AdminTransactions() {
  const [txns, setTxns] = useState<AdminTransaction[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [confirmFor, setConfirmFor] = useState<AdminTransaction | null>(null);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = () => {
    adminApi
      .getTransactions()
      .then((t) => {
        setTxns(t);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load transactions'));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return txns;
    return txns.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q) ||
        t.asset.toLowerCase().includes(q) ||
        t.userEmail.toLowerCase().includes(q),
    );
  }, [txns, query]);

  const confirmDeposit = async () => {
    if (!confirmFor) return;
    const amount = parseFloat(confirmAmount);
    if (!amount || amount <= 0) {
      setError('Enter a positive amount to confirm.');
      return;
    }
    setConfirmBusy(true);
    setError('');
    setMsg('');
    try {
      const r = await adminApi.confirmDeposit(confirmFor.id, amount);
      setMsg(r.message);
      setConfirmFor(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to confirm deposit');
    } finally {
      setConfirmBusy(false);
    }
  };

  const denyDeposit = async (t: AdminTransaction) => {
    if (busyId) return;
    setBusyId(t.id);
    setMsg('');
    setError('');
    try {
      const r = await adminApi.denyDeposit(t.id);
      setMsg(r.message);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to deny deposit');
    } finally {
      setBusyId('');
    }
  };

  const processingCount = txns.filter((t) => t.type === 'Deposit' && t.status === 'Processing').length;

  return (
    <>
      <h1 className="admin-title">Transactions</h1>
      <p className="admin-subtitle">
        View and control every transaction across all clients. Confirm or deny pending crypto deposits.
      </p>

      {error && <div className="admin-msg err"><AlertCircle size={16} /> {error}</div>}
      {msg && <div className="admin-msg ok"><CheckCircle size={16} /> {msg}</div>}

      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={16} style={{ color: 'var(--gray-400)' }} />
          <input placeholder="Search ID, type, status, asset, client…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
          <Receipt size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          {filtered.length} shown
          {processingCount > 0 && (
            <span style={{ color: 'var(--purple)', marginLeft: 10 }}>
              <Clock size={13} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
              {processingCount} awaiting confirmation
            </span>
          )}
        </div>
      </div>
      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Client</th>
                <th>Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Strategy</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="admin-empty">No transactions found.</td></tr>
              )}
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.id}</td>
                  <td>
                    <div><strong>{t.userName}</strong></div>
                    <div className="mono" style={{ color: 'var(--gray-400)' }}>{t.userEmail}</div>
                  </td>
                  <td><span className={`admin-pill ${TYPE_PILL[t.type] || 'pill-gray'}`}>{t.type}</span></td>
                  <td>{t.asset}</td>
                  <td><strong>{formatCurrency(t.amount)}</strong></td>
                  <td>{t.strategy || '—'}</td>
                  <td><span className={`admin-pill ${STATUS_PILL[t.status] || 'pill-gray'}`}>{t.status}</span></td>
                  <td className="mono">{new Date(t.date).toLocaleString()}</td>
                  <td>
                    {t.type === 'Deposit' && t.status !== 'Completed' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="admin-btn green" onClick={() => { setConfirmFor(t); setConfirmAmount(String(t.amount || '')); setError(''); }}>
                          <CheckCircle size={14} /> Confirm
                        </button>
                        <button className="admin-btn" onClick={() => denyDeposit(t)} disabled={busyId === t.id} title="Deny deposit">
                          <XCircle size={14} /> Deny
                        </button>
                      </div>
                    ) : t.requiresApproval ? (
                      <span className="admin-pill pill-amber">Multi-sig</span>
                    ) : (
                      <span style={{ color: 'var(--gray-500)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm deposit modal */}
      {confirmFor && (
        <div className="admin-modal-backdrop" onClick={() => !confirmBusy && setConfirmFor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Deposit</h3>
            <p className="admin-modal-sub">
              Crediting <strong>{confirmFor.userName}</strong> ({confirmFor.userEmail}) — {confirmFor.id}
            </p>

            <div className="admin-msg" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd' }}>
              <Clock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              Verify this {confirmFor.asset} transfer on-chain before confirming. Funds will be credited and added to the ledger.
            </div>

            <div className="form-group">
              <label>Amount to credit (USD)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                value={confirmAmount}
                onChange={(e) => setConfirmAmount(e.target.value)}
                placeholder="e.g. 5000"
                disabled={confirmBusy}
              />
            </div>

            <div className="admin-modal-actions">
              <button className="admin-btn" onClick={() => setConfirmFor(null)} disabled={confirmBusy}>Cancel</button>
              <button className="admin-btn primary" onClick={confirmDeposit} disabled={confirmBusy}>
                {confirmBusy ? 'Confirming…' : `Confirm ${confirmFor.asset} Deposit`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
