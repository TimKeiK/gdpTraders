import { useState } from 'react';
import { Bitcoin, ArrowRight, Copy, CheckCircle, AlertCircle, Info, ShieldCheck, FileCheck, ArrowLeft } from 'lucide-react';
import { api, authApi, formatCurrency } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './DashboardPages.css';

const SUPPORTED_ASSETS = [
  { value: 'USDC', label: 'USDC (USD Coin)', icon: '◉' },
  { value: 'USDT', label: 'USDT (Tether)', icon: '◉' },
  { value: 'BTC', label: 'BTC (Bitcoin)', icon: '₿' },
  { value: 'ETH', label: 'ETH (Ethereum)', icon: 'Ξ' },
];

export default function DepositPage() {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState<'form' | 'address'>('form');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('USDC');
  const [address, setAddress] = useState('');
  const [txid, setTxid] = useState('');
  
  // KYC states
  const [docType, setDocType] = useState('Passport');
  const [docNumber, setDocNumber] = useState('');
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState('');
  
  // Deposit states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

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
      await refreshProfile(); // update user.kycStatus to 'APPROVED'
    } catch (err) {
      setKycError(err instanceof Error ? err.message : 'KYC submission failed.');
    } finally {
      setKycLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) < 1) {
      setError('Please enter a valid deposit amount (minimum $1).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.createDeposit(asset, Number(amount));
      setAddress(res.depositAddress);
      setTxid(res.transaction.id);
      setStep('address');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setStep('form');
    setAmount('');
    setError('');
    setAddress('');
    setTxid('');
  };

  const isKycApproved = user?.kycStatus === 'APPROVED';

  return (
    <>
      <h1 className="dash-title">Deposit Funds</h1>
      <p className="dash-last-updated" style={{ marginBottom: 28 }}>
        Invest capital into GDPTraders. Select your target asset and amount to generate a unique funding address.
      </p>

      {/* Step 1: KYC Verification required */}
      {!isKycApproved ? (
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
              marginBottom: 16
            }}>
              <ShieldCheck size={32} />
            </div>
            <h2 className="dash-section-title" style={{ fontSize: '20px', marginBottom: 8 }}>Identity Verification Required</h2>
            <p style={{ fontSize: '14px', color: 'var(--gray-400)', lineHeight: '1.6' }}>
              To comply with global regulatory standards (KYC/AML), you must complete identity verification before making your first deposit. This process is instant.
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
                  <FileCheck size={18} /> Verify Identity & Enable Deposits
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* Step 2: Deposit Flow (KYC is Approved) */
        <div className="card" style={{ maxWidth: '680px', margin: '0 auto', position: 'relative' }}>
          {step === 'form' ? (
            <>
              <div className="deposit-intro" style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--glass-border)' }}>
                <div className="deposit-asset-badge" style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '15px', color: 'var(--white)' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(245, 197, 24, 0.12)',
                    color: 'var(--gold)'
                  }}>
                    <Bitcoin size={20} />
                  </div>
                  <span>Select an asset and enter the amount you plan to deposit.</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="deposit-form">
                <div className="form-group">
                  <label>Select Deposit Asset</label>
                  <select
                    className="form-control"
                    value={asset}
                    onChange={(e) => setAsset(e.target.value)}
                    disabled={loading}
                    style={{ fontSize: '15px', height: '52px' }}
                  >
                    {SUPPORTED_ASSETS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Amount to Deposit (USD Equivalent)</label>
                  <div className="deposit-amount-row" style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <span className="deposit-currency-prefix" style={{
                      position: 'absolute',
                      left: '20px',
                      fontSize: '18px',
                      fontWeight: 6,
                      color: 'var(--gray-400)'
                    }}>$</span>
                    <input
                      className="form-control"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="10,000"
                      min="1"
                      step="1"
                      required
                      disabled={loading}
                      style={{ paddingLeft: '38px', paddingRight: '74px', fontSize: '18px', fontWeight: 6, height: '54px' }}
                    />
                    <span className="deposit-asset-tag" style={{
                      position: 'absolute',
                      right: '20px',
                      fontWeight: 7,
                      fontSize: '14px',
                      color: 'var(--gold)',
                      background: 'rgba(245, 197, 24, 0.1)',
                      padding: '4px 10px',
                      borderRadius: '6px'
                    }}>{asset}</span>
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
                  marginBottom: 24,
                  lineHeight: '1.5'
                }}>
                  <Info size={16} style={{ color: 'var(--purple)', flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Minimum deposit is equivalent to $1. Blockchain transfers will credit to your account balance automatically after 1–2 network confirmations.
                  </span>
                </div>

                {error && (
                  <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                    <AlertCircle size={14} /> {error}
                  </p>
                )}

                <button type="submit" className="btn btn-primary deposit-btn" style={{ width: '100%', justifyContent: 'center', padding: '14px', height: '50px' }} disabled={loading}>
                  {loading ? 'Generating Address...' : 'Generate Deposit Address'} <ArrowRight size={16} />
                </button>
              </form>
            </>
          ) : (
            <div className="deposit-address-view" style={{ textAlign: 'center' }}>
              <div className="deposit-success-header" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                textAlign: 'left',
                marginBottom: 28,
                paddingBottom: 20,
                borderBottom: '1px solid var(--glass-border)'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.12)',
                  color: 'var(--green)'
                }}>
                  <CheckCircle size={26} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 7 }}>Funding Address Ready</h3>
                  <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: '2px 0 0 0' }}>
                    Transaction reference: #{txid.slice(-8)} · Please send {formatCurrency(Number(amount))} in {asset}
                  </p>
                </div>
              </div>

              <div className="deposit-address-card" style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1.5px dashed var(--glass-border)',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: 24,
                textAlign: 'left'
              }}>
                <div className="deposit-address-label" style={{
                  fontSize: '13px',
                  color: 'var(--gray-400)',
                  fontWeight: 6,
                  marginBottom: 10
                }}>
                  Send {asset} directly to this unique address:
                </div>
                <div className="deposit-address-value" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  background: 'var(--black)',
                  border: '1px solid var(--glass-border)',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '14px',
                  color: 'var(--white)',
                  wordBreak: 'break-all'
                }}>
                  <span style={{ userSelect: 'all' }}>{address}</span>
                  <button
                    className={`btn btn-sm ${copied ? 'btn-primary' : 'btn-outline'}`}
                    onClick={handleCopy}
                    type="button"
                    style={{ flexShrink: 0, minWidth: '40px', padding: '8px 12px' }}
                  >
                    {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                  </button>
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
                marginBottom: 28,
                textAlign: 'left',
                lineHeight: '1.5'
              }}>
                <Info size={16} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>Important Notice:</strong> Only send {asset} to this address. Sending any other asset will result in permanent loss of funds. Credits will clear automatically upon network confirmations.
                </span>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-outline" onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ArrowLeft size={16} /> New Deposit
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
