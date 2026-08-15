import { FileBarChart, Download, CalendarDays, PieChart } from 'lucide-react';
import './DashboardPages.css';

export default function TaxPage() {
  return (
    <>
      <h1 className="dash-title">Tax Reporting</h1>
      <p className="dash-last-updated">
        One-click export of capital gains and losses for tax season. Data is prepared with your accountant in mind.
      </p>

      <div className="dash-kpis">
        <div className="card kpi-card">
          <span className="kpi-icon"><CalendarDays size={20} /></span>
          <span className="kpi-label">Tax Year</span>
          <strong className="kpi-value">2026</strong>
        </div>
        <div className="card kpi-card">
          <span className="kpi-icon"><PieChart size={20} /></span>
          <span className="kpi-label">Realized P&L</span>
          <strong className="kpi-value pos">+$42,380.15</strong>
        </div>
        <div className="card kpi-card">
          <span className="kpi-icon"><FileBarChart size={20} /></span>
          <span className="kpi-label">Unrealized P&L</span>
          <strong className="kpi-value pos">+$18,240.62</strong>
        </div>
      </div>

      <div className="card mt-3">
        <h2 className="dash-section-title">Export Your Tax Report</h2>
        <p className="sec-sub">
          Reports include realized gains/losses by asset, transaction timestamps, cost basis method (FIFO), and USD equivalents.
        </p>

        <div className="mt-3">
          <button className="btn btn-primary" onClick={() => alert('Tax CSV export will be available once the backend is connected.')}>
            <Download size={16} /> Download CSV
          </button>
          <button className="btn btn-outline ml-2" onClick={() => alert('Form 8949 export will be available once the backend is connected.')}>
            Download Form 8949
          </button>
        </div>

        <div className="tax-note mt-4">
          <p>
            <strong>Note:</strong> Tax reporting is provided as an informational tool and does not constitute tax advice.
            Please verify all figures with a qualified tax professional.
          </p>
        </div>
      </div>
    </>
  );
}