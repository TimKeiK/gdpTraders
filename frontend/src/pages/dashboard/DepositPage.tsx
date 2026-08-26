import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Bitcoin,
  CheckCircle,
  CreditCard,
  Info,
  FileCheck,
  Lock,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { api, authApi, formatCurrency } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import './DashboardPages.css';

const SUPPORTED_ASSETS = [
  { value: 'USDT', label: 'USDT (Tether)', icon: '₮' },
  { value: 'BTC', label: 'BTC (Bitcoin)', icon: '₿' },
  { value: 'ETH', label: 'ETH (Ethereum)', icon: 'Ξ' },
];

export default function DepositPage() {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('USDT');

  // Card payment details
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvc, setCvc] = useState('');

  // KYC states
  const [docType, setDocType] = useState('Passport');
  const [docNumber, setDocNumber] = useState('');
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState('');

  // Deposit states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [depositAddress, setDepositAddress] = useState('');
  const [txRef, setTxRef] = useState('');

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

  /** Step 1 — choose asset + amount, then proceed to the card payment. */
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) < 1) {
      setError('Please enter a valid deposit amount (minimum $1).');
      return;
    }
    setError('');
    setStep('payment');
  };

  /**
   * Step 2 — charge the card. Deposits are card-only: once the card is charged,
   * the purchased asset is delivered to the constant custodial crypto wallet.
   */
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardName || !cardNumber || !expiryDate || !cvc) {
      setError('Please enter all card details.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      // Create a Stripe Payment Intent (card-only) against the constant wallet.
      const paymentRes = await api.createCardDeposit(asset, Number(amount));
      setDepositAddress(paymentRes.depositAddress);

      // NOTE: In production the card is authenticated with Stripe.js / Payment
      // Element. For this build, the payment is confirmed after a short delay.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const confirmRes = await api.confirmCardDeposit(paymentRes.paymentIntentId, asset, Number(amount));

      setTxRef(confirmRes.transaction.id);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deposit failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('form');
    setAmount('');
    setCardName('');
    setCardNumber('');
    setExpiryDate('');
    setCvc('');
    setError('');
    setDepositAddress('');
    setTxRef('');
  };

  const isKycApproved = user?.kycStatus === 'APPROVED';

  return (
    <>
      <h1 className="dash-title">Deposit Funds</h1>
      <p className="dash-last-updated" style={{ marginBottom: 28 }}>
        Deposits are made by card only. Your purchased {asset} is delivered automatically to our constant custodial crypto wallet.
      </p>

      {!isKycApproved ? (
        /* Step 1: KYC Verification required */
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
                  <FileCheck size={18} /> Verify Identity &amp; Enable Deposits
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        /* Step 2+: Card deposit flow (KYC is Approved) */
        <div className="card" style={{ maxWidth: '680px', margin: '0 auto', position: 'relative' }}>
          {step === 'form' && (
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
                    color: 'var(--gold)',
                  }}>
                    <Bitcoin size={20} />
                  </div>
                  <span>Select an asset and the amount you want to buy with your card.</span>
                </div>
              </div>

              <form onSubmit={handleFormSubmit} className="deposit-form">
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
                  <label>Amount to Deposit (USD)</label>
                  <div className="deposit-amount-row" style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                    <span className="deposit-currency-prefix" style={{
                      position: 'absolute',
                      left: '20px',
                      fontSize: '18px',
                      fontWeight: 6,
                      color: 'var(--gray-400)',
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
                      borderRadius: '6px',
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
                  lineHeight: '1.5',
                }}>
                  <CreditCard size={16} style={{ color: 'var(--purple)', flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Deposits are <strong>card-only</strong>. Once your card payment succeeds, your {asset} is delivered to our constant custodial crypto wallet and credited to your account automatically.
                  </span>
                </div>

                {error && (
                  <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                    <AlertCircle size={14} /> {error}
                  </p>
                )}

                <button type="submit" className="btn btn-primary deposit-btn" style={{ width: '100%', justifyContent: 'center', padding: '14px', height: '50px' }} disabled={loading}>
                  Continue to Card Payment <ArrowRight size={16} />
                </button>
              </form>
            </>
          )}

          {step === 'payment' && (
            <>
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
                  background: 'rgba(139, 92, 246, 0.12)',
                  color: 'var(--purple)',
                }}>
                  <CreditCard size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 7 }}>Complete Card Payment</h3>
                  <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: '2px 0 0 0' }}>
                    You're purchasing {formatCurrency(Number(amount))} worth of {asset} by card.
                  </p>
                </div>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--glass-border)',
                borderRadius: '10px',
                padding: '14px 18px',
                marginBottom: 22,
                fontSize: '14px',
              }}>
                <span style={{ color: 'var(--gray-400)' }}>Card payment (Stripe)</span>
                <span style={{ fontWeight: 7 }}>{formatCurrency(Number(amount))}</span>
              </div>

              <form onSubmit={handlePaymentSubmit} className="deposit-form">
                <div className="form-group">
                  <label>Cardholder Name</label>
                  <input
                    className="form-control"
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="Name on card"
                    required
                    disabled={loading}
                    style={{ fontSize: '15px' }}
                  />
                </div>

                <div className="form-group">
                  <label>Card Number</label>
                  <input
                    className="form-control"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value.replace(/[^0-9 ]/g, ''))}
                    placeholder="4242 4242 4242 4242"
                    required
                    disabled={loading}
                    style={{ fontSize: '15px', fontFamily: 'var(--font-mono)' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 14 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Expiry</label>
                    <input
                      className="form-control"
                      type="text"
                      autoComplete="cc-exp"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      placeholder="MM / YY"
                      required
                      disabled={loading}
                      style={{ fontSize: '15px', fontFamily: 'var(--font-mono)' }}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>CVC</label>
                    <input
                      className="form-control"
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      value={cvc}
                      onChange={(e) => setCvc(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="123"
                      maxLength={4}
                      required
                      disabled={loading}
                      style={{ fontSize: '15px', fontFamily: 'var(--font-mono)' }}
                    />
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
                  <Wallet size={16} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
                  <span>
                    After a successful card payment, your {asset} is delivered to our constant custodial crypto wallet and credited to your account. No manual crypto transfer is needed.
                  </span>
                </div>

                {error && (
                  <p className="login-error" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                    <AlertCircle size={14} /> {error}
                  </p>
                )}

                <button type="submit" className="btn btn-primary deposit-btn" style={{ width: '100%', justifyContent: 'center', padding: '14px', height: '50px' }} disabled={loading}>
                  {loading ? (
                    'Processing Payment...'
                  ) : (
                    <>
                      <Lock size={15} /> Pay {formatCurrency(Number(amount))}
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setStep('form')}
                  disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <ArrowLeft size={16} /> Back
                </button>
              </form>
            </>
          )}

          {step === 'success' && (
<div className="deposit-address-view" style={{ textAlign: 'center' }}>
              <div className="deposit-success-header" style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                textAlign: 'left',
                marginBottom: 28,
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
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 7 }}>Deposit Successful</h3>
                  <p style={{ fontSize: '13px', color: 'var(--gray-400)', margin: '2px 0 0 0' }}>
                    {formatCurrency(Number(amount))} in {asset} credited to your account and delivered to our custodial wallet.
                  </p>
                </div>
              </div>

              <div className="deposit-address-card" style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1.5px dashed var(--glass-border)',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: 24,
                textAlign: 'left',
              }}>
                <div className="deposit-address-label" style={{
                  fontSize: '13px',
                  color: 'var(--gray-400)',
                  fontWeight: 6,
                  marginBottom: 10,
                }}>
                  <Wallet size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                  Delivered to constant custodial {asset} wallet:
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
                  wordBreak: 'break-all',
                }}>
                  <span style={{ userSelect: 'all' }}>{depositAddress}</span>
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
                lineHeight: '1.5',
              }}>
                <Info size={16} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>Transaction reference:</strong> {txRef}. Your {asset} was purchased by card and delivered automatically — no further action required.
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