import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  Search,
  ShieldCheck,
  UserCog,
  Plus,
  Minus,
  AlertCircle,
  CheckCircle,
  DollarSign,
  Lock,
  TrendingUp,
  Banknote,
  ChevronDown,
  X,
} from 'lucide-react';
import { adminApi, formatCurrency, formatAmount, type AdminUser } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { INVESTMENT_PLANS } from '../../data/plans';
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

/** The 5 investment tiers, mapped to the backend plan names (no "Plan" suffix). */
const PLAN_OPTIONS = INVESTMENT_PLANS.map((p) => ({
  value: p.name.replace(' Plan', ''),
  label: `${p.icon} ${p.name}`,
  dailyAccrual: p.dailyAccrual,
  duration: p.duration,
}));

export default function AdminAccounts() {
  const { user: me } = useAuth();
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  // Deep-linkable filters: /admin/accounts?kyc=PENDING&q=ada (dashboard cards,
  // notifications and KYC review links land on a pre-filtered view).
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [kycFilter, setKycFilter] = useState(searchParams.get('kyc') ?? '');
  const [busyId, setBusyId] = useState('');
  // Demoted columns live in an expandable row instead of the default view.
  const [expandedId, setExpandedId] = useState('');

  // Manual deposit modal state
  const [depositFor, setDepositFor] = useState<AdminUser | null>(null);
  const [depAsset, setDepAsset] = useState('USDT');
  const [depAmount, setDepAmount] = useState('');
  const [depNote, setDepNote] = useState('');
  const [depBusy, setDepBusy] = useState(false);
  const [depErr, setDepErr] = useState('');

  // Manual debit (loss) modal state
  const [debitFor, setDebitFor] = useState<AdminUser | null>(null);
  const [debAsset, setDebAsset] = useState('USDT');
  const [debAmount, setDebAmount] = useState('');
  const [debNote, setDebNote] = useState('');
  const [debBusy, setDebBusy] = useState(false);
  const [debErr, setDebErr] = useState('');

  // Available-withdrawal modal state (set how much a client can withdraw)
  const [withdrawFor, setWithdrawFor] = useState<AdminUser | null>(null);
  const [wdAmount, setWdAmount] = useState('');
  const [wdBusy, setWdBusy] = useState(false);
  const [wdErr, setWdErr] = useState('');

  // Investment-plan override modal state (change/set a client's plan)
  const [planFor, setPlanFor] = useState<AdminUser | null>(null);
  const [planName, setPlanName] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [planErr, setPlanErr] = useState('');

  // Initial-deposit override modal state (change the amount on the client's card)
  const [initDepositFor, setInitDepositFor] = useState<AdminUser | null>(null);
  const [initDepositAmount, setInitDepositAmount] = useState('');
  const [initDepositBusy, setInitDepositBusy] = useState(false);
  const [initDepositErr, setInitDepositErr] = useState('');

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
    return users.filter((u) => {
      if (kycFilter && u.kycStatus !== kycFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.includes(q) ||
        u.id.toLowerCase().includes(q)
      );
    });
  }, [users, query, kycFilter]);

  /** Row click handler — the Actions cell stops propagation so buttons still work. */
  const toggleExpanded = (id: string) => {
    setExpandedId((current) => (current === id ? '' : id));
  };

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

  const openDebit = (u: AdminUser) => {
    setDebitFor(u);
    setDebAsset('USDT');
    setDebAmount('');
    setDebNote('');
    setDebErr('');
  };

  const submitDebit = async () => {
    if (!debitFor) return;
    const amount = parseFloat(debAmount);
    if (!amount || amount <= 0) {
      setDebErr('Enter a positive amount.');
      return;
    }
    setDebBusy(true);
    setDebErr('');
    try {
      await adminApi.manualDebit(debitFor.id, debAsset, amount, debNote || undefined);
      setMsg(`Debited $${formatAmount(amount)} ${debAsset} from ${debitFor.email} (recorded as loss)`);
      setDebitFor(null);
      load();
    } catch (e) {
      setDebErr(e instanceof Error ? e.message : 'Failed to debit account');
    } finally {
      setDebBusy(false);
    }
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
      setMsg(`Credited $${formatAmount(amount)} ${depAsset} to ${depositFor.email}`);
      setDepositFor(null);
      load();
    } catch (e) {
      setDepErr(e instanceof Error ? e.message : 'Failed to credit deposit');
    } finally {
      setDepBusy(false);
    }
  };

  const openWithdraw = (u: AdminUser) => {
    setWithdrawFor(u);
    setWdAmount(u.availableWithdrawal ? String(u.availableWithdrawal) : '');
    setWdErr('');
  };

  const submitWithdraw = async () => {
    if (!withdrawFor) return;
    const amount = parseFloat(wdAmount);
    if (isNaN(amount) || amount < 0) {
      setWdErr('Enter a non-negative amount.');
      return;
    }
    setWdBusy(true);
    setWdErr('');
    try {
      await adminApi.setAvailableWithdrawal(withdrawFor.id, amount);
      setMsg(`Available withdrawal for ${withdrawFor.email} set to ${formatCurrency(amount)}`);
      setWithdrawFor(null);
      load();
    } catch (e) {
      setWdErr(e instanceof Error ? e.message : 'Failed to set available withdrawal');
    } finally {
      setWdBusy(false);
    }
  };

  const openPlan = (u: AdminUser) => {
    setPlanFor(u);
    setPlanName(u.investment?.planName ? u.investment.planName.replace(' Plan', '') : '');
    setPlanErr('');
  };

  const submitPlan = async () => {
    if (!planFor) return;
    if (!planName) {
      setPlanErr('Select an investment plan.');
      return;
    }
    setPlanBusy(true);
    setPlanErr('');
    try {
      await adminApi.setInvestmentPlan(planFor.id, planName);
      setMsg(`Investment plan for ${planFor.email} set to ${planName} Plan`);
      setPlanFor(null);
      load();
    } catch (e) {
      setPlanErr(e instanceof Error ? e.message : 'Failed to update investment plan');
    } finally {
      setPlanBusy(false);
    }
  };

  const openInitDeposit = (u: AdminUser) => {
    setInitDepositFor(u);
    setInitDepositAmount(u.investment?.initialDeposit ? String(u.investment.initialDeposit) : '');
    setInitDepositErr('');
  };

  const submitInitDeposit = async () => {
    if (!initDepositFor) return;
    const amount = parseFloat(initDepositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setInitDepositErr('Enter a positive deposit amount.');
      return;
    }
    setInitDepositBusy(true);
    setInitDepositErr('');
    try {
      await adminApi.setInitialDeposit(initDepositFor.id, amount);
      setMsg(`Initial deposit for ${initDepositFor.email} set to ${formatCurrency(amount)}`);
      setInitDepositFor(null);
      load();
    } catch (e) {
      setInitDepositErr(e instanceof Error ? e.message : 'Failed to update initial deposit');
    } finally {
      setInitDepositBusy(false);
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
            placeholder="Search name, email, role or ID"
            aria-label="Search accounts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {kycFilter && (
            <span className="admin-filter-chip">
              KYC: {kycFilter}
              <button onClick={() => setKycFilter('')} title="Clear KYC filter" aria-label="Clear KYC filter">
                <X size={13} />
              </button>
            </span>
          )}
          <select
            className="admin-select"
            value={kycFilter}
            onChange={(e) => setKycFilter(e.target.value)}
            title="Filter by KYC status"
          >
            <option value="">All KYC statuses</option>
            {['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>
            <Users size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
            {filtered.length} account{filtered.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table table-accounts">
            <thead>
              <tr>
                <th>Account</th>
                <th>Role</th>
                <th>KYC status</th>
                <th>Balance</th>
                <th className="admin-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="admin-empty">
                    No accounts match your search{kycFilter ? ` (KYC ${kycFilter})` : ''}.
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const expanded = expandedId === u.id;
                return (
                  <Fragment key={u.id}>
                    <tr
                      className={`admin-row-expandable ${expanded ? 'expanded' : ''}`}
                      onClick={() => toggleExpanded(u.id)}
                      aria-expanded={expanded}
                      title="Click to view referral, P&L, deposits, withdrawals and pending items"
                    >
                      <td>
                        <div className="admin-account-cell">
                          <span className={`admin-expand-caret ${expanded ? 'open' : ''}`}>
                            <ChevronDown size={15} />
                          </span>
                          <div>
                            <div className="admin-account-name">{u.name}</div>
                            <div className="mono admin-account-email">{u.email}</div>
                            <div className="mono admin-account-id">{u.id}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className={`admin-pill ${ROLE_PILL[u.role] || 'pill-gray'}`}>{u.role}</span></td>
                      <td><span className={`admin-pill ${KYC_PILL[u.kycStatus] || 'pill-gray'}`}>{u.kycStatus}</span></td>
                      <td>
                        <strong>{formatCurrency(u.balance)}</strong>
                        <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                          <Lock size={11} style={{ verticalAlign: 'text-bottom', marginRight: 3 }} />
                          avail. wd: <span className="pos">{formatCurrency(u.availableWithdrawal)}</span>
                        </div>
                      </td>
                      <td className="admin-col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="admin-actions-group">
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
                            <>
                              <button className="admin-btn green" onClick={() => openDeposit(u)} title="Credit funds (recorded as profit)">
                                <DollarSign size={14} /> Credit
                              </button>
                              <button className="admin-btn red" onClick={() => openDebit(u)} title="Debit funds (recorded as loss)">
                                <Minus size={14} /> Debit
                              </button>
                              <button className="admin-btn" onClick={() => openWithdraw(u)} title="Set how much this client can withdraw">
                                <Lock size={14} /> Withdrawal
                              </button>
                              <button className="admin-btn" onClick={() => openPlan(u)} title="Change or set this client's investment plan (reflects on their dashboard)">
                                <TrendingUp size={14} /> Plan
                              </button>
                              <button className="admin-btn" onClick={() => openInitDeposit(u)} title="Change this client's initial deposit (reflects on their dashboard)">
                                <Banknote size={14} /> Deposit
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expanded && (
                      <tr className="admin-detail-row">
                        <td colSpan={5}>
                          <div className="admin-detail-grid">
                            <div>
                              <div className="admin-detail-label"><Users size={12} /> Referral</div>
                              <div className="admin-detail-value">
                                {u.referredBy ? (
                                  <>
                                    <span style={{ color: 'var(--gray-400)' }}>by </span>
                                    <span className="mono">{u.referredBy.email}</span>
                                  </>
                                ) : (
                                  <span style={{ color: 'var(--gray-500)' }}>Not referred</span>
                                )}
                                {(u.referredCount ?? 0) > 0 && (
                                  <div style={{ color: 'var(--gray-400)' }}>
                                    referred {u.referredCount} client{u.referredCount === 1 ? '' : 's'}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="admin-detail-label"><TrendingUp size={12} /> P&amp;L (Net)</div>
                              <div className="admin-detail-value">
                                <strong className={u.netPnl >= 0 ? 'pos' : 'neg'}>{formatCurrency(u.netPnl)}</strong>
                                <div style={{ fontSize: 11.5, color: 'var(--gray-400)' }}>
                                  <span className="pos">+{formatCurrency(u.totalProfit)}</span>
                                  {' / '}
                                  <span className="neg">-{formatCurrency(u.totalLoss)}</span>
                                </div>
                              </div>
                            </div>

                            <div>
                              <div className="admin-detail-label"><DollarSign size={12} /> Deposits</div>
                              <div className="admin-detail-value">{formatCurrency(u.deposits)}</div>
                            </div>

                            <div>
                              <div className="admin-detail-label"><Banknote size={12} /> Withdrawals</div>
                              <div className="admin-detail-value">{formatCurrency(u.withdrawals)}</div>
                            </div>

                            <div>
                              <div className="admin-detail-label"><AlertCircle size={12} /> Pending</div>
                              <div className="admin-detail-value">
                                {u.processingDeposits > 0 && (
                                  <div style={{ color: 'var(--purple)' }}>
                                    {u.processingDeposits} deposit{u.processingDeposits === 1 ? '' : 's'} awaiting confirmation
                                  </div>
                                )}
                                {u.pendingWithdrawals.length > 0 && (
                                  <div style={{ color: 'var(--amber)' }}>
                                    {u.pendingWithdrawals.length} withdrawal{u.pendingWithdrawals.length === 1 ? '' : 's'}
                                    {' · '}
                                    {formatCurrency(u.pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0))}
                                  </div>
                                )}
                                {u.processingDeposits === 0 && u.pendingWithdrawals.length === 0 && (
                                  <span style={{ color: 'var(--gray-500)' }}>Nothing pending</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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
                <h3>Credit Funds (Profit)</h3>
                <p className="admin-modal-sub">
                  Manually credit <strong>{depositFor.name}</strong> ({depositFor.email}) — recorded as <strong className="pos">profit</strong> in their P&L.
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
                placeholder="e.g. Trading profit for the week"
                disabled={depBusy}
              />
            </div>

            <div className="admin-modal-actions">
              <button className="admin-btn" onClick={() => setDepositFor(null)} disabled={depBusy}>Cancel</button>
              <button className="admin-btn primary" onClick={submitDeposit} disabled={depBusy} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Plus size={16} /> {depBusy ? 'Crediting…' : 'Credit as Profit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual debit (loss) modal */}
      {debitFor && (
        <div className="admin-modal-backdrop" onClick={() => !debBusy && setDebitFor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3>Debit Funds (Loss)</h3>
                <p className="admin-modal-sub">
                  Manually debit <strong>{debitFor.name}</strong> ({debitFor.email}) — recorded as <strong className="neg">loss</strong> in their P&L.
                  Balance: {formatCurrency(debitFor.balance)}
                </p>
              </div>
              <button className="admin-btn ghost" onClick={() => !debBusy && setDebitFor(null)}>
                <X size={18} />
              </button>
            </div>

            {debErr && <div className="admin-msg err"><AlertCircle size={16} /> {debErr}</div>}

            <div className="form-group">
              <label>Coin</label>
              <select className="form-control" value={debAsset} onChange={(e) => setDebAsset(e.target.value)} disabled={debBusy}>
                {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Amount (USD)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                value={debAmount}
                onChange={(e) => setDebAmount(e.target.value)}
                placeholder="e.g. 2500"
                disabled={debBusy}
              />
            </div>

            <div className="form-group">
              <label>Note (optional)</label>
              <input
                className="form-control"
                value={debNote}
                onChange={(e) => setDebNote(e.target.value)}
                placeholder="e.g. Trading loss for the week"
                disabled={debBusy}
              />
            </div>

            <div className="admin-modal-actions">
              <button className="admin-btn" onClick={() => setDebitFor(null)} disabled={debBusy}>Cancel</button>
              <button className="admin-btn red" onClick={submitDebit} disabled={debBusy} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Minus size={16} /> {debBusy ? 'Debiting…' : 'Debit as Loss'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set available withdrawal modal */}
      {withdrawFor && (
        <div className="admin-modal-backdrop" onClick={() => !wdBusy && setWithdrawFor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3>Set Available Withdrawal</h3>
                <p className="admin-modal-sub">
                  Set how much <strong>{withdrawFor.name}</strong> ({withdrawFor.email}) can withdraw
                  — from their initial deposit plus any profit credited. Current available: {formatCurrency(withdrawFor.availableWithdrawal)}.
                </p>
              </div>
              <button className="admin-btn ghost" onClick={() => !wdBusy && setWithdrawFor(null)}>
                <X size={18} />
              </button>
            </div>

            {wdErr && <div className="admin-msg err"><AlertCircle size={16} /> {wdErr}</div>}

            <div className="form-group">
              <label>Available withdrawal amount (USD)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                step="any"
                value={wdAmount}
                onChange={(e) => setWdAmount(e.target.value)}
                placeholder="e.g. 7500"
                disabled={wdBusy}
              />
            </div>

            <div className="admin-modal-actions">
              <button className="admin-btn" onClick={() => setWithdrawFor(null)} disabled={wdBusy}>Cancel</button>
              <button className="admin-btn primary" onClick={submitWithdraw} disabled={wdBusy} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={16} /> {wdBusy ? 'Saving…' : 'Save Available Withdrawal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set investment plan modal (admin override) */}
      {planFor && (
        <div className="admin-modal-backdrop" onClick={() => !planBusy && setPlanFor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3>Set Investment Plan</h3>
                <p className="admin-modal-sub">
                  Override the investment plan for <strong>{planFor.name}</strong> ({planFor.email}).
                  This updates their dashboard (Overview &amp; Profile Settings) immediately.
                  {planFor.investment?.planName
                    ? ` Current plan: ${planFor.investment.planName} Plan — ${formatCurrency(planFor.investment.initialDeposit)} deposit.`
                    : ' No active investment plan yet.'}
                </p>
              </div>
              <button className="admin-btn ghost" onClick={() => !planBusy && setPlanFor(null)}>
                <X size={18} />
              </button>
            </div>

            {planErr && <div className="admin-msg err"><AlertCircle size={16} /> {planErr}</div>}

            <div className="form-group">
              <label>Investment plan</label>
              <select
                className="form-control"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                disabled={planBusy}
              >
                <option value="">Select a plan…</option>
                {PLAN_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {p.dailyAccrual}% daily · {p.duration} working days
                  </option>
                ))}
              </select>
            </div>

            <div className="admin-modal-actions">
              <button className="admin-btn" onClick={() => setPlanFor(null)} disabled={planBusy}>Cancel</button>
              <button
                className="admin-btn primary"
                onClick={submitPlan}
                disabled={planBusy}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <TrendingUp size={16} /> {planBusy ? 'Saving…' : 'Set Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set initial deposit modal (admin override) */}
      {initDepositFor && (
        <div className="admin-modal-backdrop" onClick={() => !initDepositBusy && setInitDepositFor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3>Set Initial Deposit</h3>
                <p className="admin-modal-sub">
                  Change the initial deposit shown on <strong>{initDepositFor.name}</strong>'s ({initDepositFor.email})
                  investment card (Overview &amp; Profile Settings).
                  {initDepositFor.investment?.planName
                    ? ` Current: ${formatCurrency(initDepositFor.investment.initialDeposit)} — ${initDepositFor.investment.planName} Plan.`
                    : ' No active investment yet.'}
                </p>
              </div>
              <button className="admin-btn ghost" onClick={() => !initDepositBusy && setInitDepositFor(null)}>
                <X size={18} />
              </button>
            </div>

            {initDepositErr && <div className="admin-msg err"><AlertCircle size={16} /> {initDepositErr}</div>}

            <div className="form-group">
              <label>Initial deposit (USD)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                step="any"
                value={initDepositAmount}
                onChange={(e) => setInitDepositAmount(e.target.value)}
                placeholder="e.g. 5000"
                disabled={initDepositBusy}
              />
            </div>

            <div className="admin-modal-actions">
              <button className="admin-btn" onClick={() => setInitDepositFor(null)} disabled={initDepositBusy}>Cancel</button>
              <button
                className="admin-btn primary"
                onClick={submitInitDeposit}
                disabled={initDepositBusy}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Banknote size={16} /> {initDepositBusy ? 'Saving…' : 'Set Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

