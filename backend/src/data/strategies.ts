/**
 * Investment product definitions from backend.md §2.1.
 * Products are defined by how they work - NOT by promised returns.
 */

export interface Strategy {
  id: string;
  name: string;
  assetFocus: string;
  volatilityProfile: string;
  mechanism: string;
  minInvestment: number;
}

export const STRATEGIES: Strategy[] = [
  {
    id: 'btc-eth-core',
    name: 'BTC/ETH Core',
    assetFocus: 'Spot Bitcoin & Ethereum',
    volatilityProfile: 'Medium-High',
    mechanism:
      'Long-term holding with layered staking yields. Seeks to outperform passive buy-and-hold via covered call overwriting.',
    minInvestment: 10000,
  },
  {
    id: 'arbitrage-alpha',
    name: 'Arbitrage Alpha',
    assetFocus: 'Futures vs. Spot Basis',
    volatilityProfile: 'Low-Medium',
    mechanism:
      'Captures the spread between perpetual futures and underlying spot indexes. Uncorrelated to directional market moves.',
    minInvestment: 25000,
  },
  {
    id: 'defi-treasury',
    name: 'DeFi Treasury',
    assetFocus: 'Stablecoins (USDC/USDT)',
    volatilityProfile: 'Low',
    mechanism:
      'Deploys capital into audited lending protocols (Aave/Compound) and short-term treasuries.',
    minInvestment: 5000,
  },
  {
    id: 'active-quant',
    name: 'Active Quant',
    assetFocus: 'Top-10 Liquid Coins',
    volatilityProfile: 'High',
    mechanism:
      'Systematic momentum and mean-reversion algorithms with volatility-targeting position sizing.',
    minInvestment: 50000,
  },
];

export function getStrategyById(id: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.id === id);
}

export const SUPPORTED_ASSETS = ['BTC', 'ETH', 'USDC', 'USDT', 'SOL'];