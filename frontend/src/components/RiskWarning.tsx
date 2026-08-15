import { FileWarning } from 'lucide-react';

export default function RiskWarning({ compact = false }: { compact?: boolean }) {
  return (
    <div className="risk-warning">
      <strong>
        <FileWarning size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
        {compact ? 'RISK WARNING' : 'IMPORTANT RISK DISCLOSURE'}
      </strong>
      <p>
        The strategies described on this page do not constitute a promise of financial return.
        Historical backtested data, where available, is shared via a secure data-room only during
        the onboarding process. Past performance is not indicative of future results. All
        strategies carry the risk of total capital loss.
      </p>
    </div>
  );
}