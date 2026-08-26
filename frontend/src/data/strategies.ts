export interface Strategy {
  id: string;
  name: string;
  assetFocus: string;
  volatilityProfile: 'Low' | 'Low-Medium' | 'Medium-High' | 'High';
  volatilityClass: 'low' | 'low-medium' | 'medium' | 'medium-high' | 'high';
  mechanism: string;
  minInvestment: number;
  liquidity: string;
  managementFee: string;
  performanceFee: string;
  benchmark: string;
  description: string;
  highlights: string[];
  risks: string[];
}

export const strategies: Strategy[] = [
  {
    id: 'btc-eth-core',
    name: 'BTC/ETH Core',
    assetFocus: 'Spot Bitcoin & Ethereum',
    volatilityProfile: 'Medium-High',
    volatilityClass: 'medium-high',
    mechanism:
      'Long-term holding with layered staking yields. Seeks to outperform a passive buy-and-hold via covered call overwriting.',
    minInvestment: 10000,
    liquidity: 'Daily',
    managementFee: '1.5% p.a.',
    performanceFee: '15% of profits',
    benchmark: 'BTC/ETH 60/40 Index',
    description:
      'Our core strategy provides structured exposure to the two most liquid digital assets. By layering staking yields and systematically selling covered calls, we aim to reduce the volatility drag of pure buy-and-hold while retaining long-term upside participation.',
    highlights: [
      'Layered staking yields on both BTC and ETH',
      'Covered call overwriting to reduce volatility drag',
      'Daily liquidity with no lock-up',
      'Cold-storage custody with multi-signature controls',
    ],
    risks: [
      'Cryptocurrency markets are highly volatile',
      'Staking involves protocol and slashing risk',
      'Covered calls cap upside during strong bull markets',
      'Possible loss of total capital',
    ],
  },
  {
    id: 'arbitrage-alpha',
    name: 'Arbitrage Alpha',
    assetFocus: 'Futures vs. Spot Basis',
    volatilityProfile: 'Low-Medium',
    volatilityClass: 'low-medium',
    mechanism:
      'Captures the price spread between perpetual futures and underlying spot indexes. Uncorrelated to directional market moves.',
    minInvestment: 25000,
    liquidity: 'Weekly',
    managementFee: '1.5% p.a.',
    performanceFee: '15% of profits',
    benchmark: 'Cash (T-Bill) + Volatility Target',
    description:
      'A market-neutral strategy that harvests the funding-rate and basis spread between perpetual futures contracts and their underlying spot assets. Designed to generate returns that are largely independent of the direction of the crypto market.',
    highlights: [
      'Market-neutral: uncorrelated to BTC price direction',
      'Historic funding-rate capture across major exchanges',
      'Dynamic hedge ratios to maintain delta neutrality',
      'Trade execution across regulated and OTC venues',
    ],
    risks: [
      'Basis can compress or invert during market stress',
      'Exchange counterparty and settlement risk',
      'Execution slippage under volatile conditions',
      'Possible loss of total capital',
    ],
  },
  {
    id: 'defi-treasury',
    name: 'DeFi Treasury',
    assetFocus: 'Stablecoins (USDT)',
    volatilityProfile: 'Low',
    volatilityClass: 'low',
    mechanism:
      'Deploys capital into diversified, audited lending protocols (Aave/Compound) and short-term treasuries. Generates yield from funding rates.',
    minInvestment: 5000,
    liquidity: 'Daily',
    managementFee: '1.5% p.a.',
    performanceFee: '15% of profits',
    benchmark: 'USD Short-Term Treasury Index',
    description:
      'A capital-preservation strategy focused on stablecoin yield. Capital is deployed across diversified, independently audited lending protocols and short-term treasury instruments to generate steady, low-volatility returns.',
    highlights: [
      'Diversified allocation across audited lending protocols',
      'Short-term treasury exposure for capital preservation',
      'Lowest volatility profile in the portfolio suite',
      'Daily liquidity and transparent on-chain reporting',
    ],
    risks: [
      'Stablecoin depeg risk',
      'Smart contract and protocol exploits',
      'Lending market liquidity crunches',
      'Possible loss of total capital',
    ],
  },
  {
    id: 'active-quant',
    name: 'Active Quant',
    assetFocus: 'Top-10 Liquid Coins',
    volatilityProfile: 'High',
    volatilityClass: 'high',
    mechanism:
      'Systematic momentum and mean-reversion algorithms. Positions sized dynamically based on realized volatility (Volatility Targeting).',
    minInvestment: 50000,
    liquidity: 'Weekly',
    managementFee: '1.5% p.a.',
    performanceFee: '15% of profits',
    benchmark: 'CRyptocurrency Top-10 Index',
    description:
      'Our highest-octane strategy deploys systematic momentum and mean-reversion signals across the top-10 most liquid cryptocurrencies. Positions are dynamically sized using volatility targeting to manage drawdowns in turbulent markets.',
    highlights: [
      'Fully systematic, rules-based signal generation',
      'Volatility targeting for dynamic position sizing',
      'Universe of the top-10 most liquid digital assets',
      'Daily rebalancing with institutional execution',
    ],
    risks: [
      'High volatility and drawdown potential',
      'Model risk — signals can underperform regimes',
      'Sharp algorithmic execution in thin order books',
      'Possible loss of total capital',
    ],
  },
];

export function getStrategyById(id: string | undefined): Strategy | undefined {
  return strategies.find((s) => s.id === id);
}