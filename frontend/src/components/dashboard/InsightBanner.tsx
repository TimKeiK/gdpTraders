import { Lightbulb, Sparkles } from 'lucide-react';
import type { PortfolioSummary } from '../../api/client';
import { formatCurrency, formatPercent } from '../../api/client';

interface InsightBannerProps {
  summary: PortfolioSummary | null;
}

/**
 * Actionable insight generated from the user's portfolio data. Always resolves
 * to a positive, motative message using semantic colours.
 */
export default function InsightBanner({ summary }: InsightBannerProps) {
  if (!summary) return null;

  const { totalProfit, initialDeposit, totalValue, totalProfitPercent, todayPnl, todayPnlPercent } = summary;

  let tone: 'pos' | 'neutral' = 'pos';
  let icon = 'growth';
  let title: string;
  let detail: string;

  if (initialDeposit <= 0) {
    tone = 'neutral';
    icon = 'start';
    title = 'Ready to grow your capital?';
    detail = 'Fund your account to begin earning passive returns on the Silver Plan and beyond.';
  } else if (todayPnl > 0) {
    icon = 'growth';
    title = `You made ${formatCurrency(todayPnl)} today (${formatPercent(todayPnlPercent)}).`;
    detail = `That’s ${formatCurrency(todayPnl)} in passive income — keep compounding by reinvesting when it matures.`;
  } else if (totalProfit > 0) {
    icon = 'growth';
    // Quote the passive-income yield (profit ÷ deposits), matching the dollar
    // figure in the detail line — NOT the net P&L percent, which diverges when
    // trading activity loses money.
    title = `You've earned ${formatPercent(totalProfitPercent)} in passive income since you started.`;
    detail = `That’s ${formatCurrency(totalProfit)} in cumulative passive income on a ${formatCurrency(initialDeposit)} base.`;
  } else if (totalValue > 0) {
    icon = 'watch';
    title = `Your portfolio is currently valued at ${formatCurrency(totalValue)}.`;
    detail = 'Daily accruals post automatically every business day — your balance updates without you lifting a finger.';
  } else {
    icon = 'watch';
    title = 'Your portfolio is warming up.';
    detail = 'Once your deposit is confirmed, daily accruals start automatically every business day.';
  }

  return (
    <div className={`insight-banner tone-${tone}`} role="status">
      <span className="insight-icon" aria-hidden="true">
        {icon === 'growth' ? <Sparkles size={18} /> : <Lightbulb size={18} />}
      </span>
      <div className="insight-text">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}