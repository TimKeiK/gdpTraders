import { KeyRound, Plus, Trash2, Lock } from 'lucide-react';
import './DashboardPages.css';

const whitelistedAddresses = [
  { label: 'Cold Storage — Primary', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', asset: 'BTC' },
  { label: 'Reserve — Secondary', address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', asset: 'ETH' },
];

export default function SecurityPage() {
  return (
    <>
      <h1 className="dash-title">Security</h1>
      <p className="dash-last-updated">
        Address whitelisting and strict access controls to prevent unauthorized access.
      </p>

      <div className="card mb-3">
        <div className="sec-row">
          <div className="sec-icon"><Lock size={20} /></div>
          <div className="sec-info">
            <h3 className="dash-section-title" style={{ marginBottom: 4 }}>Withdrawal Whitelisting</h3>
            <p className="sec-sub">
              Withdrawals are only permitted to whitelisted addresses. New addresses require a 48-hour cooling-off period.
            </p>
          </div>
        </div>

        <table className="data-table mt-3">
          <thead>
            <tr>
              <th>Label</th>
              <th>Asset</th>
              <th>Address</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {whitelistedAddresses.map((w) => (
              <tr key={w.label}>
                <td><strong>{w.label}</strong></td>
                <td><span className="badge badge-outline">{w.asset}</span></td>
                <td className="txn-hash">{w.address}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-sm btn-outline" onClick={() => alert('Address removal requires a 48h review period.')}>
                    <Trash2 size={14} /> Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button className="btn btn-outline mt-3" onClick={() => alert('New address requests require a 48-hour cooling-off period before activation.')}>
          <Plus size={16} /> Add Whitelisted Address
        </button>
      </div>

      <div className="card">
        <div className="sec-row">
          <div className="sec-icon"><KeyRound size={20} /></div>
          <div className="sec-info">
            <h3 className="dash-section-title" style={{ marginBottom: 4 }}>API Keys</h3>
            <p className="sec-sub">
              Programmatic access requires a dedicated API key with strictly scoped permissions.
            </p>
          </div>
          <div>
            <button className="btn btn-sm btn-outline" onClick={() => alert('API key generation will be available once the backend is connected.')}>
              Manage Keys
            </button>
          </div>
        </div>
      </div>
    </>
  );
}