import { useEffect, useState } from 'react';
import { User as UserIcon, KeyRound, Wallet, Check, AlertCircle, Save, BadgeCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { authApi, api, formatCurrency } from '../../api/client';
import type { ActiveInvestment } from '../../api/client';
import PasswordInput from '../../components/PasswordInput';
import './DashboardPages.css';

/** Networks each withdrawable asset supports (USDT has TRC-20 and BEP-20). */
const WITHDRAW_NETWORKS: Record<
  string,
  { value: string; label: string; placeholder: string }[]
> = {
  USDT: [
    { value: 'TRC-20', label: 'Tron (TRC-20)', placeholder: 'TXYz4hPq8...' },
    { value: 'BEP-20', label: 'BNB Smart Chain (BEP-20)', placeholder: '0x71C7656...' },
  ],
  BTC: [{ value: 'BTC', label: 'Bitcoin Network', placeholder: 'bc1q... / 1A1zP1...' }],
  ETH: [{ value: 'ERC-20', label: 'Ethereum (ERC-20)', placeholder: '0x71C7656...' }],
};

/** Assets the client can withdraw. */
const WITHDRAW_ASSETS = [
  { value: 'USDT', label: 'USDT (Tether)', icon: '₮' },
  { value: 'BTC', label: 'Bitcoin (BTC)', icon: '₿' },
  { value: 'ETH', label: 'Ethereum (ETH)', icon: 'Ξ' },
] as const;

export default function ProfileSettingsPage() {
  const { user, updateUser } = useAuth();

  // --- Username ---
  const [name, setName] = useState(user?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // --- Password ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

    // --- Withdrawal address ---
  const [address, setAddress] = useState(user?.withdrawalAddress ?? '');
  const [network, setNetwork] = useState(user?.withdrawalNetwork ?? '');
  const [asset, setAsset] = useState(user?.withdrawalAsset ?? '');
  const [addrSaving, setAddrSaving] = useState(false);
  const [addrMsg, setAddrMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // --- Investment plan (same source as the Overview page: investments table) ---
  const [investment, setInvestment] = useState<ActiveInvestment | null>(null);
  const [daysRemaining, setDaysRemaining] = useState(0);
  useEffect(() => {
    api.getInvestment().then((res) => {
      setInvestment(res.investment);
      setDaysRemaining(res.daysRemaining);
    }).catch(() => {});
  }, []);

     useEffect(() => { setName(user?.name ?? ''); }, [user?.name]);
  useEffect(() => { setAddress(user?.withdrawalAddress ?? ''); }, [user?.withdrawalAddress]);
  useEffect(() => { setNetwork(user?.withdrawalNetwork ?? ''); }, [user?.withdrawalNetwork]);
  useEffect(() => { setAsset(user?.withdrawalAsset ?? ''); }, [user?.withdrawalAsset]);

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameMsg(null);
    if (!name.trim()) { setNameMsg({ ok: false, text: 'Name cannot be empty.' }); return; }
    setNameSaving(true);
    try {
      const res = await authApi.updateProfile(name.trim());
      updateUser({ name: res.name });
      setNameMsg({ ok: true, text: 'Username updated successfully.' });
    } catch (err) {
      setNameMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to update username.' });
    } finally {
      setNameSaving(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword.length < 8) { setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' }); return; }
    if (newPassword !== confirmPassword) { setPwMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    setPwSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPwMsg({ ok: true, text: 'Password updated successfully.' });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to change password.' });
    } finally {
      setPwSaving(false);
    }
  };

    const saveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddrMsg(null);
    const trimmed = address.trim();
    if (!trimmed) { setAddrMsg({ ok: false, text: 'Wallet address is required.' }); return; }
    setAddrSaving(true);
    try {
      const res = await authApi.updateWithdrawalAddress(trimmed, network || undefined, asset || undefined);
      updateUser({
        withdrawalAddress: res.withdrawalAddress,
        withdrawalNetwork: res.withdrawalNetwork,
        withdrawalAsset: res.withdrawalAsset,
      });
      setAddrMsg({ ok: true, text: 'Withdrawal address and preferences saved. Future withdrawals default to this address.' });
    } catch (err) {
      setAddrMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to save withdrawal address.' });
    } finally {
      setAddrSaving(false);
    }
  };

  return (
    <>
      <h1 className="dash-title">Profile Settings</h1>
      <p className="dash-last-updated">Manage your account details, security and payout preferences.</p>

      {/* Investment plan — identical card/layout to the Overview page banner */}
      {investment && investment.planName ? (
        <div className="card" style={{ padding: '18px 22px', marginBottom: 20, borderLeft: '3px solid var(--gold)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <BadgeCheck size={22} style={{ color: 'var(--gold)', flexShrink: 0 }} />
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--gold)' }}>Current Investment Plan: {investment.planName} Plan</h3>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray-400)' }}>
              {daysRemaining > 0 ? `${daysRemaining} working day${daysRemaining === 1 ? '' : 's'} remaining` : 'Matured'}
            </span>
          </div>
          <div className="plan-banner-stats" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Initial Deposit</div>
              <strong style={{ fontSize: 16 }}>{formatCurrency(investment.initialDeposit)}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Daily Accrual</div>
              <strong style={{ fontSize: 16, color: 'var(--green)' }}>{investment.dailyRate}%</strong>
            </div>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Duration</div>
              <strong style={{ fontSize: 16 }}>{investment.durationDays} working days</strong>
            </div>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Expected Total Payout</div>
              <strong style={{ fontSize: 16, color: 'var(--gold)' }}>{formatCurrency(investment.totalExpectedReturn ?? 0)}</strong>
            </div>
            <div>
              <div style={{ color: 'var(--gray-400)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>Matures On</div>
              <strong style={{ fontSize: 16 }}>{investment.endDate ? new Date(investment.endDate).toLocaleDateString() : '—'}</strong>
            </div>
          </div>
        </div>
      ) : investment && investment.status === 'under_review' ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 22px', marginBottom: 20, borderLeft: '3px solid var(--gold)' }}>
          <BadgeCheck size={22} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--gray-400)', flex: 1, minWidth: 200 }}>
            Your deposit of {formatCurrency(investment.initialDeposit)} is under review — it is below the $20 minimum
            for an investment plan. Please contact support.
          </p>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 22px', marginBottom: 20, borderLeft: '3px solid var(--gold)' }}>
          <BadgeCheck size={22} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <p style={{ margin: 0, fontSize: 14, color: 'var(--gray-400)', flex: 1, minWidth: 200 }}>
            No investment plan active yet — deposit at least $20 (Bronze Plan minimum) to get started.
          </p>
        </div>
      )}

      {/* Username */}
      <div className="card mb-3">
        <div className="sec-row">
          <div className="sec-icon"><UserIcon size={20} /></div>
          <div className="sec-info">
            <h3 className="dash-section-title" style={{ marginBottom: 4 }}>Account Details</h3>
            <p className="sec-sub">Email: {user?.email}</p>
          </div>
        </div>
        <form onSubmit={saveName} className="profile-form">
          <label className="form-label" htmlFor="profile-name">Username / Display Name</label>
          <input
            id="profile-name"
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={100}
          />
          {nameMsg && (
            <p className={`profile-msg ${nameMsg.ok ? 'profile-msg-ok' : 'profile-msg-err'}`}>
              {nameMsg.ok ? <Check size={14} /> : <AlertCircle size={14} />} {nameMsg.text}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-sm profile-submit" disabled={nameSaving}>
            <Save size={14} /> {nameSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Password */}
      <div className="card mb-3">
        <div className="sec-row">
          <div className="sec-icon"><KeyRound size={20} /></div>
          <div className="sec-info">
            <h3 className="dash-section-title" style={{ marginBottom: 4 }}>Change Password</h3>
            <p className="sec-sub">Use at least 8 characters. You will need your current password.</p>
          </div>
        </div>
        <form onSubmit={savePassword} className="profile-form">
          <label className="form-label" htmlFor="pw-current">Current Password</label>
          <PasswordInput id="pw-current" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
          <div className="profile-form-grid">
            <div>
              <label className="form-label" htmlFor="pw-new">New Password</label>
              <PasswordInput id="pw-new" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
            </div>
            <div>
              <label className="form-label" htmlFor="pw-confirm">Confirm New Password</label>
              <PasswordInput id="pw-confirm" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
            </div>
          </div>
          {pwMsg && (
            <p className={`profile-msg ${pwMsg.ok ? 'profile-msg-ok' : 'profile-msg-err'}`}>
              {pwMsg.ok ? <Check size={14} /> : <AlertCircle size={14} />} {pwMsg.text}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-sm profile-submit" disabled={pwSaving}>
            <KeyRound size={14} /> {pwSaving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Withdrawal address */}
      <div className="card">
        <div className="sec-row">
          <div className="sec-icon"><Wallet size={20} /></div>
          <div className="sec-info">
            <h3 className="dash-section-title" style={{ marginBottom: 4 }}>Default Withdrawal Address</h3>
            <p className="sec-sub">
              Set a constant wallet address, coin and network used by default for withdrawals. You can still override them per withdrawal.
            </p>
          </div>
        </div>
        <form onSubmit={saveAddress} className="profile-form">
          <div className="profile-form-grid">
            <div>
              <label className="form-label" htmlFor="wd-asset">Coin</label>
              <select
                id="wd-asset"
                className="form-control"
                value={asset}
                onChange={(e) => {
                  setAsset(e.target.value);
                  // Reset network to the first available for the chosen coin
                  const firstNet = WITHDRAW_NETWORKS[e.target.value]?.[0]?.value ?? '';
                  setNetwork(firstNet);
                }}
              >
                <option value="">Select a coin</option>
                {WITHDRAW_ASSETS.map((a) => (
                  <option key={a.value} value={a.value}>{a.icon} {a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" htmlFor="wd-network">Network</label>
              <select
                id="wd-network"
                className="form-control"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                disabled={!asset}
              >
                <option value="">Select a network</option>
                {asset && WITHDRAW_NETWORKS[asset]?.map((n) => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </select>
            </div>
          </div>
          <label className="form-label" htmlFor="wd-address">Wallet Address</label>
          <input
            id="wd-address"
            className="form-control"
            style={{ fontFamily: 'monospace', fontSize: 13 }}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={asset && network ? WITHDRAW_NETWORKS[asset]?.find((n) => n.value === network)?.placeholder ?? 'Paste your wallet address' : 'e.g. TUc2… or 0x…'}
          />
          {addrMsg && (
            <p className={`profile-msg ${addrMsg.ok ? 'profile-msg-ok' : 'profile-msg-err'}`}>
              {addrMsg.ok ? <Check size={14} /> : <AlertCircle size={14} />} {addrMsg.text}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-sm profile-submit" disabled={addrSaving}>
            <Save size={14} /> {addrSaving ? 'Saving…' : 'Save Address'}
          </button>
        </form>
      </div>
    </>
  );
}
