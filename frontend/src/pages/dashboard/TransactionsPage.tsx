import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, formatCurrency, type Transaction } from '../../api/client';
import './DashboardPages.css';

const statusClass: Record<Transaction['status'], string> = {
  Completed: 'status-completed',
  Pending: 'status-pending',
  Processing: 'status-processing',
  Cancelled: 'status-failed',
};

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    let mounted = true;
    api.getTransactions().then((data) => { if (mounted) setTxs(data); });
    return () => { mounted = false; };
  }, []);

  return (
    <>
      <h1 className="dash-title">Transaction History</h1>
      <p className="dash-last-updated">
        Immutable ledger of every trade executed on your behalf.
      </p>

      <div className="card">
        <div className="txn-actions">
          <h2 className="dash-section-title" style={{ marginBottom: 0 }}>All Transactions</h2>
          <button className="btn btn-sm btn-outline" onClick={() => alert('CSV export will be available once the backend is connected.')}>
            <Download size={14} /> Export CSV
          </button>
        </div>

        <div className="txn-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Type</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => (
                <tr key={tx.id}>
                  <td className="txn-id">{tx.id}</td>
                  <td className="txn-date">{tx.date}</td>
                  <td className={`tx-type ${tx.type === 'Withdrawal' ? 'neg' : tx.type === 'Deposit' ? 'pos' : ''}`}>
                    {tx.type}
                  </td>
                  <td>{tx.asset}</td>
                  <td>{formatCurrency(tx.amount)}</td>
                  <td><span className={`status-badge ${statusClass[tx.status]}`}>{tx.status}</span></td>
                  <td className="txn-hash" title={tx.txHash}>{tx.txHash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}