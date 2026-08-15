import { Link } from 'react-router-dom';
import { ArrowRight, Layers, ShieldCheck, TrendingUp, CircleDollarSign } from 'lucide-react';
import { strategies } from '../data/strategies';
import './StrategiesPage.css';

const icons: Record<string, any> = {
  'btc-eth-core': TrendingUp,
  'arbitrage-alpha': Layers,
  'defi-treasury': ShieldCheck,
  'active-quant': CircleDollarSign,
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function StrategiesPage() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="eyebrow">Investment Products</span>
          <h1 className="page-hero-title">Four Strategies. One Focus: Crypto.</h1>
          <p className="page-hero-subtitle">
            Every strategy is 100% digital assets — no drift into unrelated asset classes.
            Each is systematically managed with institutional-grade risk controls.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="strategy-table-wrap card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Asset Focus</th>
                  <th>Volatility</th>
                  <th>Mechanism</th>
                  <th>Min. Investment</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((s) => {
                  const Icon = icons[s.id] ?? TrendingUp;
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="strategy-name-cell">
                          <span className="strategy-icon"><Icon size={18} /></span>
                          <strong>{s.name}</strong>
                        </div>
                      </td>
                      <td className="strategy-asset">{s.assetFocus}</td>
                      <td><span className={`badge badge-${s.volatilityClass}`}>{s.volatilityProfile}</span></td>
                      <td className="strategy-mechanism">{s.mechanism}</td>
                      <td className="strategy-min">{fmt(s.minInvestment)}</td>
                      <td className="strategy-cta-cell">
                        <Link to={`/strategies/${s.id}`} className="btn btn-sm btn-outline">
                          Details <ArrowRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}