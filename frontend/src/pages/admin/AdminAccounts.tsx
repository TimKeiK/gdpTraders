import { useEffect, useMemo, useState } from 'react';
import {
  Users,
  Search,
  ShieldCheck,
  UserCog,
  Plus,
  AlertCircle,
  CheckCircle,
  DollarSign,
  X,
} from 'lucide-react';
import { adminApi, formatCurrency, type AdminUser } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './admin.css';

const KYC_PILL: Record<string, string> = {
  APPROVED: 'pill-green',
  PENDING: 'pill-amber',
  SUBMITTED: 'pill-purple',
  REJECTED: 'pill-red',
};

const ROLE_PILL: Record<string, string> = {
  admin: 'pill-red',
  compliance: 'pill-purple',
  client: 'pill-gray',
};

const ASSETS = ['USDT', 'BTC', 'ETH'];

export default function AdminAccounts() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');

  // Manual deposit modal state
  const [depositFor, setDepositFor] = useState<AdminUser | null>(null);
  const [depAsset, setDepAsset] = useState('USDT');
  const [depAmount, setDepAmount] = useState('');
  const [depNote, setDepNote] = useState('');
  const [depBusy, setDepBusy] = useState(false);
  const [depErr, setDepErr] = useState('');

  const load = () => {
    adminApi
      .getUsers()
      .then((u) => {
        setUsers(u);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load accounts'));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.includes(q) ||
        u.id.toLowerCase().includes(q),
    );
  }, [users, query]);

  const setKyc = async (u: AdminUser, status: string) => {
    if (busyId) return;
    setBusyId(u.id);
    setMsg('');
    setError('');
    try {
      await adminApi.setKyc(u.id, status);
      setMsg(`KYC for ${u.email} set to ${status}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update KYC');
    } finally {
      setBusyId('');
    }
  };

  const setRole = async (u: AdminUser, role: string) => {
    if (busyId) return;
    setBusyId(u.id);
    setMsg('');
    setError('');
    try {
      await adminApi.setRole(u.id, role);
      setMsg(`Role for ${u.email} changed to ${role}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setBusyId('');
    }
  };

  const openDeposit = (u: AdminUser) => {
    setDepositFor(u);
    setDepAsset('USDT');
    setDepAmount('');
    setDepNote('');
    setDepErr('');
  };

  const submitDeposit = async () => {
    if (!depositFor) return;
    const amount = parseFloat(depAmount);
    if (!amount || amount <= 0) {
      setDepErr('Enter a positive amount.');
      return;
    }
    setDepBusy(true);
    setDepErr('');
    try {
      await adminApi.manualDeposit(depositFor.id, depAsset, amount, depNote || undefined);
      setMsg(`Credited ${amount} ${depAsset} to ${depositFor.email}`);
      setDepositFor(null);
      load();
    } catch (e) {
      setDepErr(e instanceof Error ? e.message : 'Failed to credit deposit');
    } finally {
      setDepBusy(false);
    }
  };

  const isStaff = (role: string) => role === 'admin' || role === 'compliance';

  return (
    <>
      <h1 className="admin-title">Accounts &amp; Funds</h1>
      <p className="admin-subtitle">
        Manage every client account, verify KYC, adjust roles, and credit funds directly.
      </p>

      {error && <div className="admin-msg err"><AlertCircle size={16} /> {error}</div>}
      {msg && <div className="admin-msg ok"><CheckCircle size={16} /> {msg}</div>}

      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={16} style={{ color: 'var(--gray-400)' }} />
          <input
            placeholder="Search name, email, role, or ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
          <Users size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          {filtered.length} account{filtered.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Role</th>
                <th>KYC</th>
                <th>Balance</th>
                <th>Deposits</th>
                <th>Withdrawals</th>
                <th>Pending</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="admin-empty">No accounts match your search.</td></tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div><strong>{u.name}</strong></div>
                    <div className="mono" style={{ color: 'var(--gray-400)' }}>{u.email}</div>
                    <div className="mono" style={{ color: 'var(--gray-500)', fontSize: 11 }}>{u.id}</div>
                  </td>
                  <td><span className={`admin-pill ${ROLE_PILL[u.role] || 'pill-gray'}`}>{u.role}</span></td>
                  <td><span className={`admin-pill ${KYC_PILL[u.kycStatus] || 'pill-gray'}`}>{u.kycStatus}</span></td>
                  <td><strong>{formatCurrency(u.balance)}</strong></td>
                  <td>{formatCurrency(u.deposits)}</td>
                  <td>{formatCurrency(u.withdrawals)}</td>
                  <td>
                    {u.processingDeposits > 0 && (
                      <div style={{ color: 'var(--purple)' }}>{u.processingDeposits} deposit</div>
                    )}
                    {u.pendingWithdrawals.length > 0 && (
                      <div style={{ color: 'var(--amber)' }}>{u.pendingWithdrawals.length} withdrawal</div>
                    )}
                    {u.processingDeposits === 0 && u.pendingWithdrawals.length === 0 && (
                      <span style={{ color: 'var(--gray-500)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <select
                        className="admin-select"
                        value={u.kycStatus}
                        onChange={(e) => setKyc(u, e.target.value)}
                        disabled={busyId === u.id}
                        title="Change KYC status"
                      >
                        {['APPROVED', 'PENDING', 'SUBMITTED', 'REJECTED'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>

                      {me?.role === 'admin' ? (
                        <select
                          className="admin-select"
                          value={u.role}
                          onChange={(e) => setRole(u, e.target.value)}
                          disabled={busyId === u.id}
                          title="Change role"
                        >
                          {['client', 'compliance', 'admin'].map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="admin-pill pill-gray" style={{ marginRight: 4 }}>
                          <UserCog size={13} /> staff only
                        </span>
                      )}

                      {isStaff(u.role) ? (
                        <span className="admin-pill pill-gray">
                          <ShieldCheck size={13} /> staff account
                        </span>
                      ) : (
                        <button className="admin-btn green" onClick={() => openDeposit(u)} title="Credit funds">
                          <DollarSign size={14} /> Credit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual deposit modal */}
      {depositFor && (
        <div className="admin-modal-backdrop" onClick={() => !depBusy && setDepositFor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3>Credit Funds</h3>
                <p className="admin-modal-sub">
                  Manually credit <strong>{depositFor.name}</strong> ({depositFor.email})
                </p>
              </div>
              <button className="admin-btn ghost" onClick={() => !depBusy && setDepositFor(null)}>
                <X size={18} />
              </button>
            </div>

            {depErr && <div className="admin-msg err"><AlertCircle size={16} /> {depErr}</div>}

            <div className="form-group">
              <label>Coin</label>
              <select className="form-control" value={depAsset} onChange={(e) => setDepAsset(e.target.value)} disabled={depBusy}>
                {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Amount (USD)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                value={depAmount}
                onChange={(e) => setDepAmount(e.target.value)}
                placeholder="e.g. 5000"
                disabled={depBusy}
              />
            </div>

            <div className="form-group">
              <label>Note (optional)</label>
              <input
                className="form-control"
                value={depNote}
                onChange={(e) => setDepNote(e.target.value)}
                placeholder="e.g. Manual adjustment"
                disabled={depBusy}
              />
            </div>

            <div className="admin-modal-actions">
              <button className="admin-btn" onClick={() => setDepositFor(null)} disabled={depBusy}>Cancel</button>
              <button className="admin-btn primary" onClick={submitDeposit} disabled={depBusy} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} /> {depBusy ? 'Crediting…' : 'Credit Funds'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

