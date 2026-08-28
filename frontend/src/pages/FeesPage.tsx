import { CheckCircle2, Percent, Clock, Ban, Wallet, CalendarDays } from 'lucide-react';
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

const withdrawalPolicy = [
  { icon: CalendarDays, title: 'Processing Days', value: 'Monday – Friday' },
  { icon: Clock, title: 'Processing Time', value: '1–3 business days after approval' },
  { icon: Ban, title: 'Withdrawal Fee', value: '$0' },
  { icon: Wallet, title: 'Network Gas', value: 'Passed through at cost' },
];

const withdrawalNotes = [
  'Withdrawals are available Monday to Friday for all plans.',
  'Once submitted and approved, requests are initiated within 1 to 3 business days.',
  'The processing timeline begins only after the request has passed our internal verification checks.',
];

export default function FeesPage() {
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

          <div className="card mt-4 withdrawal-card">
            <h3 className="fee-section-title">Withdrawal Policy</h3>
            <p className="withdrawal-intro">
              Withdrawals are available Monday to Friday for all plans. Once a request
              is submitted and approved, it is initiated within 1 to 3 business days,
              and the timeline begins only after it has passed our internal verification
              checks.
            </p>
            <div className="withdrawal-grid">
              {withdrawalPolicy.map((item) => (
                <div className="withdrawal-item" key={item.title}>
                  <item.icon size={18} />
                  <span>{item.title}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <ul className="withdrawal-notes">
              {withdrawalNotes.map((note) => (
                <li key={note}><CheckCircle2 size={16} /> {note}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}