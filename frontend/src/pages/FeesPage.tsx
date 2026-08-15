import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Percent, Clock, Ban, Wallet } from 'lucide-react';
import { api, type WithdrawalPolicy } from '../api/client';
import './FeesPage.css';

const feeRows = [
  { fee: 'Management Fee', charge: '1.5% per annum', detail: 'Charged monthly on assets under management.', icon: Percent },
  { fee: 'Performance Fee', charge: '15% of profits', detail: 'Only charged when we beat the benchmark. High Water Mark applies.', icon: Wallet },
  { fee: 'Withdrawal Fee', charge: '$0', detail: 'Network gas fees may apply, passed through at cost.', icon: Ban },
  { fee: 'Entry / Load Fees', charge: 'None', detail: 'No subscription or redemption load fees. Ever.', icon: CheckCircle2 },
];

const highWaterMark = [
  'We only charge a performance fee on new profits above the previous peak.',
  'If the portfolio falls, the High Water Mark resets only once new gains recover the loss.',
  'A falling market never triggers a performance fee.',
];

export default function FeesPage() {
  const [policy, setPolicy] = useState<WithdrawalPolicy | null>(null);

  useEffect(() => {
    let mounted = true;
    api.getWithdrawalPolicy().then((p) => { if (mounted) setPolicy(p); });
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Fee Schedule</span>
          <h1 className="page-hero-title">No Hidden Fees. Ever.</h1>
          <p className="page-hero-subtitle">
            We are explicit about everything we charge. If we cannot explain a fee in plain English, we do not charge it.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="fees-grid">
            {feeRows.map((row) => (
              <div className="card fee-card" key={row.fee}>
                <span className="fee-card-icon"><row.icon size={22} /></span>
                <h3 className="fee-card-title">{row.fee}</h3>
                <p className="fee-card-charge">{row.charge}</p>
                <p className="fee-card-detail">{row.detail}</p>
              </div>
            ))}
          </div>

          <div className="card mt-4">
            <h3 className="fee-section-title">How the High Water Mark Works</h3>
            <p className="fee-section-sub">Performance fee is charged only when we beat the benchmark at a new all-time high.</p>
            <ul className="hwm-list">
              {highWaterMark.map((item) => (
                <li key={item}><CheckCircle2 size={18} /> {item}</li>
              ))}
            </ul>
          </div>

          <div className="card mt-4">
            <h3 className="fee-section-title">Withdrawal Policy</h3>
            <div className="withdrawal-grid">
              {policy ? (
                <>
                  <div className="withdrawal-item"><Clock size={18} /><span>Fiat Processing</span><strong>{policy.processingTimeFiat}</strong></div>
                  <div className="withdrawal-item"><Clock size={18} /><span>Crypto Processing</span><strong>{policy.processingTimeCrypto}</strong></div>
                  <div className="withdrawal-item"><Ban size={18} /><span>Withdrawal Fee</span><strong>{policy.withdrawalFee}</strong></div>
                  <div className="withdrawal-item"><Wallet size={18} /><span>Network Gas</span><strong>{policy.networkFees}</strong></div>
                </>
              ) : (
                <p>Loading withdrawal policy…</p>
              )}
            </div>
          </div>

          <div className="fee-note card mt-4">
            <XCircle size={20} />
            <p>
              <strong>Important:</strong> The 15% performance fee is waived entirely for the first 12 months of the closed beta. Terms are fully documented in the subscription agreement.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}