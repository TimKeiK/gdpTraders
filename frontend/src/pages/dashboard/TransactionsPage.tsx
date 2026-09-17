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

  const exportCsv = () => {
    if (!txs.length) return;
    const headers = ['ID', 'Date', 'Type', 'Strategy/Description', 'Asset', 'Amount (USD)', 'Status', 'Tx Hash'];
    const rows = txs.map((t) => [
      `"${t.id}"`,
      `"${t.date}"`,
      `"${t.type}"`,
      `"${t.strategy || ''}"`,
      `"${t.asset}"`,
      t.amount,
      `"${t.status}"`,
      `"${t.txHash || ''}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <h1 className="dash-title">Transaction History</h1>
      <p className="dash-last-updated">
        Immutable ledger of every trade, daily accrual, and transfer on your account.
      </p>

      <div className="card">
        <div className="txn-actions">
          <h2 className="dash-section-title" style={{ marginBottom: 0 }}>All Transactions</h2>
          <button className="btn btn-sm btn-outline" onClick={exportCsv} disabled={!txs.length}>
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
                <th>Description</th>
                <th>Asset</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((tx) => {
                const isPos = tx.type === 'Deposit' || tx.type === 'Daily Accrual' || tx.type.toLowerCase().includes('accrual') || tx.type.toLowerCase().includes('profit');
                const isNeg = tx.type === 'Withdrawal';
                return (
                  <tr key={tx.id}>
                    <td className="txn-id">{tx.id}</td>
                    <td className="txn-date">{new Date(tx.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                    <td className={`tx-type ${isNeg ? 'neg' : isPos ? 'pos' : ''}`}>
                      {tx.type}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--gray-300)' }}>{tx.strategy || '—'}</td>
                    <td>{tx.asset}</td>
                    <td className={`mono ${isNeg ? 'neg' : isPos ? 'pos' : ''}`}>
                      {isPos ? '+' : isNeg ? '-' : ''}{formatCurrency(tx.amount)}
                    </td>
                    <td><span className={`status-badge ${statusClass[tx.status] || 'status-completed'}`}>{tx.status}</span></td>
                    <td className="txn-hash" title={tx.txHash}>{tx.txHash || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}