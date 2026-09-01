import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Clock,
  FileCheck,
  Loader,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { api, authApi, type Transaction } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './DashboardPages.css';
import './DepositPage.css';

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

type Step = 'form' | 'submitted';

export default function WithdrawPage() {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>('form');
  const [asset, setAsset] = useState('USDT');
  const [network, setNetwork] = useState('TRC-20');
  const [amount, setAmount] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [txRef, setTxRef] = useState('');

  // Client's own withdrawal history
  const [history, setHistory] = useState<Transaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const selectedAsset =
    WITHDRAW_ASSETS.find((a) => a.value === asset) ?? WITHDRAW_ASSETS[0];
  const withdrawNetworks = WITHDRAW_NETWORKS[asset] ?? WITHDRAW_NETWORKS.USDT;
  const selectedNetwork =
    withdrawNetworks.find((n) => n.value === network) ?? withdrawNetworks[0];

  /** When the coin changes, reset the network to that coin's first option. */
  const handleAssetChange = (v: string) => {
    setAsset(v);
    setNetwork(WITHDRAW_NETWORKS[v]?.[0]?.value ?? '');
  };

  /** Load the client's transactions, filtered to withdrawals. */
  const loadHistory = () => {
    api
      .getTransactions()
      .then((all) => setHistory(all.filter((t) => t.type === 'Withdrawal')))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  };

  useEffect(loadHistory, []);

  const isKycApproved = user?.kycStatus === 'APPROVED';

  /** Submit the withdrawal request (backend enforces KYC, cap, funds, address format). */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid withdrawal amount.');
      return;
    }
    if (!destAddress.trim()) {
      setError('Please enter the wallet address where you want to receive your crypto.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.createWithdrawal(asset, parsedAmount, destAddress.trim(), selectedNetwork.value);
      setTxRef(res.transaction.id);
      setStep('submitted');
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your withdrawal request.');
    } finally {
      setLoading(false);
    }
  };

  /** KYC verification form handler (same flow as deposit). */
  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docNumber.trim()) {
      setKycError('Please enter your document number.');
      return;
    }
    setKycLoading(true);
    setKycError('');
    try {
      await authApi.submitKyc(docType, docNumber);
      await refreshProfile();
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'KYC submission failed.');
    } finally {
      setKycLoading(false);
    }
  };

  // --- KYC states ---
  const [docType, setDocType] = useState('Passport');
  const [docNumber, setDocNumber] = useState('');
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState('');

  return (
    <>
      <h1 className="dash-title">Withdraw Funds</h1>
      <p className="dash-last-updated" style={{ marginBottom: 28 }}>
        Request a withdrawal of your funds to your own crypto wallet. Your request is reviewed and
        approved by our team before the transfer is sent to your wallet address.
      </p>

      {!isKycApproved ? (
        /* KYC Verification required — same gate as deposit */
        <div className="card" style={{ maxWidth: '640px', margin: '0 auto', borderTop: '4px solid var(--purple)' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: 'rgba(139, 92, 246, 0.1)',
              color: 'var(--purple)',
              marginBottom: 16,
            }}>
              <ShieldCheck size={32} />
            </div>
            <h2 className="dash-section-title" style={{ fontSize: '20px', marginBottom: 8 }}>Identity Verification Required</h2>
            <p style={{ fontSize: '14px', color: 'var(--gray-400)', lineHeight: '1.6' }}>
              To comply with global regulatory standards (KYC/AML), you must complete identity
              verification before requesting a withdrawal. This process is instant.
            </p>
          </div>

          <form onSubmit={handleKycSubmit} style={{ marginTop: 24 }}>
            <div className="form-group">
              <label>Document Type</label>
              <select
                className="form-control"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                disabled={kycLoading}
              >
                <option value="Passport">Passport</option>
                <option value="DriverLicense">Driver's License</option>
                <option value="NationalID">National ID Card</option>
              </select>
            </div>

            <div className="form-group">
              <label>Document / ID Number</label>
              <input
                className="form-control"
                type="text"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                placeholder="e.g., G-98729347"
                required
                disabled={kycLoading}
              />
            </div>

            {kycError && (
              <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <AlertCircle size={14} /> {kycError}
              </p>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }} disabled={kycLoading}>
              {kycLoading ? 'Verifying Identity...' : (<><FileCheck size={18} /> Verify Identity &amp; Enable Withdrawals</>)}
            </button>
          </form>
        </div>
      ) : step === 'form' ? (
        <WithdrawForm
          asset={asset}
          setAsset={handleAssetChange}
          amount={amount}
          setAmount={setAmount}
          destAddress={destAddress}
          setDestAddress={setDestAddress}
          network={network}
          setNetwork={setNetwork}
          networks={withdrawNetworks}
          selectedNetwork={selectedNetwork}
          loading={loading}
          error={error}
          onSubmit={handleSubmit}
          selectedAsset={selectedAsset}
        />
      ) : (
        /* Submitted successfully */
        <WithdrawSubmitted
          amount={amount}
          asset={asset}
          txRef={txRef}
          onNew={() => { setStep('form'); setAmount(''); setDestAddress(''); }}
        />
      )}

      {/* ---- Withdrawal history ---- */}
      {!isKycApproved && history.length === 0 ? null : (
        <WithdrawHistory
          history={history}
          loading={historyLoading}
        />
      )}
    </>
  );
}

// =========================== Sub-components ===========================

type AssetDef = typeof WITHDRAW_ASSETS[number];

type WithdrawNetwork = (typeof WITHDRAW_NETWORKS)['USDT'][number];

function WithdrawForm(props: {
  asset: string;
  setAsset: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  destAddress: string;
  setDestAddress: (v: string) => void;
  network: string;
  setNetwork: (v: string) => void;
  networks: WithdrawNetwork[];
  selectedNetwork: WithdrawNetwork;
  loading: boolean;
  error: string;
  selectedAsset: AssetDef;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { asset, setAsset, amount, setAmount, destAddress, setDestAddress, network, setNetwork, networks, selectedNetwork, loading, error, selectedAsset, onSubmit } = props;
  return (
    <div className="withdraw-grid">
      {/* ---- Left: the request form ---- */}
      <div className="card deposit-card">
        <div className="deposit-step-heading">
          <span className="deposit-step-number">1</span>
          <div>
            <h3>What do you want to withdraw?</h3>
            <p>Pick the coin, tell us how much, and give us your wallet address.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="deposit-form">
          <div className="form-group">
            <label>Select Coin</label>
            <select
              className="form-control"
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              disabled={loading}
              style={{ fontSize: '15px', height: '52px' }}
            >
              {WITHDRAW_ASSETS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.icon}  {a.label}
                </option>
              ))}
            </select>
          </div>

          {networks.length > 1 && (
            <div className="form-group">
              <label>Select Network</label>
              <select
                className="form-control"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                disabled={loading}
                style={{ fontSize: '15px', height: '52px' }}
              >
                {networks.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
              <p className="form-hint">
                {selectedAsset.label} can be withdrawn on more than one network. Pick the{' '}
                <strong>{selectedNetwork.label}</strong> network you want to receive your funds on.
              </p>
            </div>
          )}

          <p className="form-hint" style={{ marginBottom: 16 }}>
            You'll receive {selectedAsset.label.split(' ')[0]} on the{' '}
            <strong>{selectedNetwork.label}</strong>.
          </p>

          <div className="form-group">
            <label>Amount (USD)</label>
            <input
              className="form-control"
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              placeholder="e.g. 2,500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={loading}
              style={{ fontSize: '16px', height: '52px' }}
            />
          </div>

          <div className="form-group">
            <label>Your Wallet Address ({selectedNetwork.label})</label>
            <input
              className="form-control"
              type="text"
              value={destAddress}
              onChange={(e) => setDestAddress(e.target.value)}
              placeholder={`Paste your ${asset} wallet address, e.g. ${selectedNetwork.placeholder}`}
              required
              disabled={loading}
              style={{ fontFamily: 'monospace', fontSize: '14px' }}
            />
            <p className="form-hint">
              This is where we send your crypto. Make sure it is a{' '}
              <strong>{asset}</strong> address on the{' '}
              <strong>{selectedNetwork.label}</strong>.
            </p>
          </div>

          {error && (
            <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <AlertCircle size={14} /> {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary deposit-btn"
            style={{ width: '100%', justifyContent: 'center', padding: '14px', height: '50px' }}
            disabled={loading}
          >
            {loading ? (
              <><Loader size={16} /> Submitting…</>
            ) : (
              <>Submit Withdrawal Request <Wallet size={16} /></>
            )}
          </button>
        </form>
      </div>

      {/* ---- Right: what happens next + warning ---- */}
      <div className="withdraw-side">
        <div className="card deposit-info-card">
          <h3 className="dash-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <Clock size={17} /> What happens after I submit?
          </h3>
          <ol className="withdraw-next-steps">
            <li><strong>Review:</strong> Our team verifies your request and balance.</li>
            <li><strong>Dual approval:</strong> Two staff members (Admin + Compliance) must both sign off.</li>
            <li><strong>Transfer:</strong> Once approved, we send the coins to your wallet address and you can track it in Transactions.</li>
          </ol>
        </div>

        <div className="deposit-warning">
          <AlertCircle size={18} />
          <div>
            <strong>Address accuracy matters.</strong> Crypto transfers are irreversible. If you
            submit a wrong or incompatible address (for example an ETH address for a BTC
            withdrawal), your funds may be lost permanently. Always double-check that the address
            matches the coin and network you selected.
          </div>
        </div>
      </div>
    </div>
  );
}

function WithdrawSubmitted(props: {
  amount: string;
  asset: string;
  txRef: string;
  onNew: () => void;
}) {
  const { amount, asset, txRef, onNew } = props;
  return (
    <div className="card deposit-card" style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'rgba(34, 197, 94, 0.12)',
        color: 'var(--green)',
        marginBottom: 16,
      }}>
        <CheckCircle size={32} />
      </div>
      <h2 className="dash-section-title" style={{ fontSize: '20px', marginBottom: 8 }}>Request Received!</h2>
      <p style={{ fontSize: '14px', color: 'var(--gray-400)', lineHeight: 1.7, maxWidth: 440, margin: '0 auto' }}>
        Your withdrawal of <strong>{amount} USD</strong> in <strong>{asset}</strong> to your wallet is now
        pending approval. We will notify you once both approvals are complete and the transfer has been made.
      </p>
      <p className="mono" style={{ marginTop: 16, color: 'var(--gray-400)', fontSize: 13 }}>
        Reference: <span style={{ color: 'var(--gold)' }}>{txRef}</span>
      </p>
      <button className="btn btn-outline" style={{ marginTop: 24, justifyContent: 'center' }} onClick={onNew}>
        <ArrowLeft size={15} /> New Withdrawal Request
      </button>
    </div>
  );
}

function WithdrawHistory({ history, loading }: { history: Transaction[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="card" style={{ marginTop: 28 }}>
        <h2 className="dash-section-title" style={{ fontSize: 17 }}>My Withdrawal Requests</h2>
        <p style={{ color: 'var(--gray-400)', fontSize: 14 }}>Loading…</p>
      </div>
    );
  }
  if (history.length === 0) {
    return null;
  }
  return (
    <div className="card" style={{ marginTop: 28 }}>
      <h2 className="dash-section-title" style={{ fontSize: 17 }}>My Withdrawal Requests</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Coin</th>
              <th>Amount</th>
              <th>Destination Address</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {history.map((t) => {
              const a = WITHDRAW_ASSETS.find((x) => x.value === t.asset);
              return (
                <tr key={t.id}>
                  <td>{new Date(t.date).toLocaleDateString()}</td>
                  <td>{a?.icon ?? ''} {t.asset}{t.network ? ` (${t.network})` : ''}</td>
                  <td><strong>${Number(t.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></td>
                  <td className="mono" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.destinationAddress ?? '—'}
                  </td>
                  <td>
                    <span className={
                      t.status === 'Completed'
                        ? 'status-badge status-completed'
                        : t.status === 'Cancelled'
                          ? 'status-badge status-failed'
                          : 'status-badge status-pending'
                    }>
                      {t.status === 'Pending' ? 'Awaiting Approval' : t.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}