import { useState } from 'react';
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  ClipboardCopy,
  Clock,
  ExternalLink,
  FileCheck,
  Info,
  Loader,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { api, authApi } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './DashboardPages.css';
import './DepositPage.css';

const SUPPORTED_ASSETS = [
  {
    value: 'USDT',
    label: 'USDT (Tether)',
    icon: '₮',
    network: 'Tron (TRC-20)',
    networkNote:
      'Send USDT on the TRC-20 network. Sending on another network (e.g. ERC-20, BEP-20) WILL lose your funds.',
  },
  {
    value: 'BTC',
    label: 'BTC (Bitcoin)',
    icon: '₿',
    network: 'Bitcoin Network',
    networkNote: 'Send BTC on the Bitcoin network. Sending on another network WILL lose your funds.',
  },
  {
    value: 'ETH',
    label: 'ETH (Ethereum)',
    icon: 'Ξ',
    network: 'Ethereum (ERC-20)',
    networkNote:
      'Send ETH on the Ethereum network. Sending on another network WILL lose your funds.',
  },
];

// These addresses match backend/src/routes/wallet.ts DEPOSIT_WALLET_ADDRESSES.
const DEPOSIT_ADDRESSES: Record<string, string> = {
  USDT: 'TUc2wxZTmfseu42idSDdhKDT35eyUiWwwp',
  BTC: '0x69276bb6ccd6927ac2623a6b18601ce2d48efda3',
  ETH: '0x69276bb6ccd6927ac2623a6b18601ce2d48efda3',
};

export default function DepositPage() {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState<'select' | 'instructions' | 'sent'>('select');
  const [asset, setAsset] = useState('USDT');

  // KYC states
  const [docType, setDocType] = useState('Passport');
  const [docNumber, setDocNumber] = useState('');
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState('');

  // Deposit states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [txRef, setTxRef] = useState('');

  const selectedAsset = SUPPORTED_ASSETS.find((a) => a.value === asset) ?? SUPPORTED_ASSETS[0];
  const address = DEPOSIT_ADDRESSES[asset];

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

  /** Step 1 — choose the coin you want to deposit. */
  const handleSelect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) {
      setError('Please choose a coin to deposit.');
      return;
    }
    setError('');
    setStep('instructions');
  };

  /** Copy the deposit address to the clipboard. */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  /**
   * Final step — the user has sent their coins. We record a pending deposit
   * so our team knows to verify the on-chain transfer.
   */
  const handleMarkSent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.submitCryptoDeposit(asset);
      setTxRef(res.transaction.id);
      setStep('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your deposit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('select');
    setAsset('USDT');
    setError('');
    setCopied(false);
    setTxRef('');
  };

  const isKycApproved = user?.kycStatus === 'APPROVED';

  return (
    <>
      <h1 className="dash-title">Deposit Funds</h1>
      <p className="dash-last-updated" style={{ marginBottom: 28 }}>
        Send the coin of your choice to our secure deposit address. Simply create a MetaMask wallet, buy
        your coin, and transfer it to the address below — it is credited once the network confirms it.
      </p>

      {!isKycApproved ? (
        /* KYC Verification required */
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
              verification before making your first deposit. This process is instant.
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
              {kycLoading ? (
                'Verifying Identity...'
              ) : (
                <>
                  <FileCheck size={18} /> Verify Identity &amp; Enable Deposits
                </>
              )}
            </button>
          </form>
        </div>
      ) : step === 'select' ? (
        /* Step 1: Choose a coin */
        <div className="card deposit-card">
          <div className="deposit-step-heading">
            <span className="deposit-step-number">1</span>
            <div>
              <h3>Which coin do you want to deposit?</h3>
              <p>Choose the coin you'd like to send. You'll get the correct address and network next.</p>
            </div>
          </div>

          <form onSubmit={handleSelect} className="deposit-form">
            <div className="form-group">
              <label>Select Deposit Coin</label>
              <select
                className="form-control"
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
                disabled={loading}
                style={{ fontSize: '15px', height: '52px' }}
              >
                {SUPPORTED_ASSETS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.icon}  {a.label} — {a.network}
                  </option>
                ))}
              </select>
              <p className="form-hint">
                {selectedAsset.icon} {selectedAsset.label} will be sent via the{' '}
                <strong>{selectedAsset.network}</strong>.
              </p>
            </div>

            {error && (
              <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <AlertCircle size={14} /> {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary deposit-btn" style={{ width: '100%', justifyContent: 'center', padding: '14px', height: '50px' }}>
              Get Deposit Address <Wallet size={16} />
            </button>
          </form>
        </div>
      ) : step === 'instructions' ? (
        /* Step 2: Instructions + address */
        <div className="card deposit-card">
          <div className="deposit-step-heading">
            <span className="deposit-step-number">2</span>
            <div>
              <h3>Buy &amp; transfer your {asset}</h3>
              <p>Follow these simple steps, then send your coins to the address below.</p>
            </div>
          </div>

          {/* Step-by-step guide */}
          <div className="deposit-guide">
            <div className="deposit-guide-step">
              <span className="deposit-guide-num">A</span>
              <div>
                <h4>1. Create a MetaMask wallet</h4>
                <p>
                  Visit <a href="https://metamask.io" target="_blank" rel="noreferrer">metamask.io</a>{' '}
                  and install the browser extension or app. Create a new wallet and safely back up your
                  secret recovery phrase. Keep it private — never share it with anyone.
                </p>
              </div>
            </div>

            <div className="deposit-guide-step">
              <span className="deposit-guide-num">B</span>
              <div>
                <h4>2. Buy {asset} coins</h4>
                <p>
                  Inside MetaMask, tap <strong>Buy</strong> and choose a payment method to purchase{' '}
                  {selectedAsset.label}. You can buy from a linked exchange or card provider. Make sure
                  you're buying <strong>{asset}</strong>, not a different coin.
                </p>
              </div>
            </div>

            <div className="deposit-guide-step">
              <span className="deposit-guide-num">C</span>
              <div>
                <h4>3. Transfer your {asset} to the deposit address</h4>
                <p>
                  In MetaMask, tap <strong>Send</strong>, paste the deposit address below, confirm the
                  network is <strong>{selectedAsset.network}</strong>, enter the amount, and confirm the
                  transaction.
                </p>
              </div>
            </div>
          </div>


          {/* Deposit address */}
          <div className="deposit-address-card">
            <div className="deposit-address-label">
              <Wallet size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
              Deposit address for {asset}
            </div>
            <div className="deposit-address-value">
              <span style={{ userSelect: 'all', wordBreak: 'break-all' }}>{address}</span>
              <button
                type="button"
                className={`deposit-copy-btn${copied ? ' copied' : ''}`}
                onClick={handleCopy}
                title="Copy address"
              >
                {copied ? <CheckCircle size={16} /> : <ClipboardCopy size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="deposit-address-network">
              <Info size={14} />
              Network: <strong>{selectedAsset.network}</strong>
            </div>
          </div>

          {/* Network warning */}
          <div className="deposit-warning">
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              <strong>Important:</strong> {selectedAsset.networkNote} Only send {asset} to this address.
              Double-check the network before confirming your transfer.
            </span>
          </div>

          {error && (
            <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <AlertCircle size={14} /> {error}
            </p>
          )}

          <div className="deposit-actions">
            <button type="button" className="btn btn-outline" onClick={() => setStep('select')} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={16} /> Back
            </button>
            <button type="button" className="btn btn-primary" onClick={handleMarkSent} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {loading ? <Loader size={16} className="spin" /> : <CheckCircle size={16} />}
              {loading ? 'Recording...' : "I've Sent My Coins"}
            </button>
          </div>

          <p className="deposit-post-send">
            After transferring, tap <strong>"I've Sent My Coins"</strong>. We'll verify the transfer on
            the blockchain and credit your account once it's confirmed (usually within minutes).
          </p>
        </div>
      ) : (
        /* Step 3: Sent confirmation */
        <div className="deposit-address-view" style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div className="card deposit-card">
            <div className="deposit-success-header" style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textAlign: 'left',
              marginBottom: 24,
              paddingBottom: 20,
              borderBottom: '1px solid var(--glass-border)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'rgba(34, 197, 94, 0.12)',
                color: 'var(--green)',
              }}>
                <CheckCircle size={26} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Transfer Submitted</h3>
                <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: '2px 0 0 0' }}>
                  Your {asset} transfer has been recorded. We'll verify it on the blockchain shortly.
                </p>
              </div>
            </div>

            <div className="deposit-info-box" style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--glass-border)',
              borderRadius: '8px',
              padding: '14px 16px',
              fontSize: '13px',
              color: 'var(--gray-400)',
              marginBottom: 20,
              lineHeight: '1.5',
            }}>
              <Clock size={16} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
              <span>
                <strong>What happens next?</strong> Network confirmations usually take a few minutes.
                Once confirmed, your {asset} is credited to your account and appears in your portfolio.
                If you have questions, contact support with reference <strong>{txRef}</strong>.
              </span>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowLeft size={16} /> New Deposit
              </button>
              <a className="btn btn-primary" href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <ExternalLink size={16} /> View Portfolio
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

