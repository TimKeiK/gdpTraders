import type { ComponentType, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

interface KpiCardProps {
  icon: ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Semantic tone: 'pos' (green), 'neg' (red), 'warn' (amber), or undefined (default). */
  tone?: 'pos' | 'neg' | 'warn';
  /** Optional explainer icon shown next to the label (e.g. the withdrawal tooltip). */
  labelHint?: ReactNode;
  /** When provided the card becomes a clickable button that opens a detail modal. */
  onOpen?: () => void;
  /** Visual emphasis — Total Portfolio Value is deliberately larger. */
  hero?: boolean;
  className?: string;
}

/**
 * Interactive KPI card. Uses a semantic tone, monospace figures for perfect
 * alignment, a hover lift + arrow affordance, and an optional click action.
 */
export default function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  labelHint,
  onOpen,
  hero,
  className = '',
}: KpiCardProps) {
  const Root = onOpen ? 'button' : 'div';
  const rootClass = [
    'card',
    'kpi-card',
    hero ? 'kpi-hero' : '',
    tone ? `tone-${tone}` : '',
    onOpen ? 'kpi-card-clickable' : 'kpi-card-static',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Root
      className={rootClass}
      onClick={onOpen}
      type={onOpen ? 'button' : undefined}
      aria-label={onOpen ? `Open ${label} details` : undefined}
    >
      <div className="kpi-topline">
        <span className={`kpi-icon ${tone ? `tone-${tone}` : ''}`}>
          <Icon size={hero ? 22 : 20} />
        </span>
        {onOpen && <ChevronRight size={16} className="kpi-open-arrow" aria-hidden="true" />}
      </div>
      <span className="kpi-label">
        {label}
        {labelHint}
      </span>
      <span className={`kpi-value ${tone ? tone : ''}`}>{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </Root>
  );
}