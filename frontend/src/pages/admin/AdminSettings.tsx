import { useState } from 'react';
import { KeyRound, Check, AlertCircle } from 'lucide-react';
import { authApi } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import PasswordInput from '../../components/PasswordInput';
import './admin.css';

export default function AdminSettings() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (newPassword.length < 8) { setMsg({ ok: false, text: 'New password must be at least 8 characters.' }); return; }
    if (newPassword !== confirmPassword) { setMsg({ ok: false, text: 'New passwords do not match.' }); return; }
    setSaving(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setMsg({ ok: true, text: 'Password updated successfully.' });
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to change password.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1 className="admin-title">Settings</h1>
      <p className="admin-subtitle">Manage your admin account security.</p>

      <div className="admin-card">
        <h2 className="admin-section-title">Change Password</h2>
        <p className="admin-section-sub">
          Signed in as <strong>{user?.email}</strong>. Use at least 8 characters.
        </p>
        <form onSubmit={save} className="admin-form">
          <label className="form-label" htmlFor="adm-pw-current">Current Password</label>
          <PasswordInput id="adm-pw-current" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
          <div className="admin-form-grid">
            <div>
              <label className="form-label" htmlFor="adm-pw-new">New Password</label>
              <PasswordInput id="adm-pw-new" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
            </div>
            <div>
              <label className="form-label" htmlFor="adm-pw-confirm">Confirm New Password</label>
              <PasswordInput id="adm-pw-confirm" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
            </div>
          </div>
          {msg && (
            <p className={`profile-msg ${msg.ok ? 'profile-msg-ok' : 'profile-msg-err'}`}>
              {msg.ok ? <Check size={14} /> : <AlertCircle size={14} />} {msg.text}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
            <KeyRound size={14} /> {saving ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </>
  );
}
