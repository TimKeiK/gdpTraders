import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Clock } from 'lucide-react';
import type { ActiveInvestment } from '../../api/client';
import { formatCurrency } from '../../api/client';
import Celebration from './Celebration';

interface InvestmentPlanCardProps {
  investment: ActiveInvestment;
  daysRemaining: number;
}

const MILESTONES = [25, 50, 75, 100];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Next local midnight — a clean stand-in for the daily accrual cut-over. */
function nextPayoutTime(now: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function InvestmentPlanCard({ investment, daysRemaining }: InvestmentPlanCardProps) {
  const totalDays = investment.durationDays || 100;
  const elapsed = Math.min(totalDays, Math.max(0, totalDays - daysRemaining));
  const pct = totalDays > 0 ? Math.min(100, (elapsed / totalDays) * 100) : 0;

  const dailyAccrual = (investment.initialDeposit * ((investment.dailyRate ?? 0) / 100)) || 0;

  const [now, setNow] = useState(() => Date.now());
  const [burstKey, setBurstKey] = useState(0);
  const [celebrated, setCelebrated] = useState<Set<number>>(new Set());
  const [milestoneMsg, setMilestoneMsg] = useState('');

  // Live countdown to the next daily accrual.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const countdown = useMemo(() => {
    const target = nextPayoutTime(now);
    const diff = Math.max(0, target - now);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${pad(h)} : ${pad(m)} : ${pad(s)}`;
  }, [now]);

  // Celebrate crossing a progress milestone (once each).
  useEffect(() => {
    if (totalDays <= 0 || daysRemaining <= 0) return;
    const crossed = MILESTONES.filter((m) => pct >= m && !celebrated.has(m));
    const highest = crossed[crossed.length - 1];
    if (!highest) return;

    setCelebrated((prev) => new Set(prev).add(highest));
    setMilestoneMsg(`Your plan is now ${highest}% complete — earning ${formatCurrency(dailyAccrual)} every day.`);
    setBurstKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  const matureLabel = investment.endDate
    ? new Date(investment.endDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  return (
    <section className="card plan-progress-card" aria-label="Current investment plan progress">
      <Celebration
        burstKey={burstKey}
        title={burstKey > 0 ? 'Milestone unlocked!' : 'Milestone reached!'}
        message={milestoneMsg}
      />

      <div className="plan-progress-head">
        <div className="plan-progress-title">
          <BadgeCheck size={22} className="plan-progress-badge" aria-hidden="true" />
          <div>
            <span className="plan-progress-eyebrow">Current Investment Plan</span>
            <h2 className="plan-progress-name">{investment.planName} Plan</h2>
          </div>
        </div>
        <div className="plan-progress-daychip">
          Day <strong>{elapsed}</strong> of {totalDays}
        </div>
      </div>

      {/* Progress bar with milestone ticks */}
      <div className="plan-track">
        <div className="plan-track-fill" style={{ width: `${pct}%` }} />
        <span className="plan-track-pct mono">{pct.toFixed(0)}%</span>
        {MILESTONES.map((m) => (
          <span
            key={m}
            className={`plan-milestone ${pct >= m ? 'done' : ''}`}
            style={{ left: `calc(${m}% - 4px)` }}
            title={`${m}% complete`}
            role="img"
            aria-label={`${m}% milestone`}
          >
            <span className="plan-milestone-dot" />
            <em>{m}%</em>
          </span>
        ))}
      </div>

      {/* Timeline + countdown */}
      <div className="plan-timeline">
        <div className="plan-timeline-stats">
          <div>
            <span className="plan-stat-label">Matures On</span>
            <strong className="mono">{matureLabel}</strong>
          </div>
          <div>
            <span className="plan-stat-label">Daily Accrual</span>
            <strong className="mono pos">+{formatCurrency(dailyAccrual)}</strong>
          </div>
          <div className="plan-countdown">
            <span className="plan-stat-label">
              <Clock size={13} /> Next payout in
            </span>
            <strong className="mono plan-countdown-time">{countdown}</strong>
          </div>
        </div>
        <div className="plan-timeline-track">
          <span className="plan-timeline-fill-line" style={{ width: `${pct}%` }} />
          <span className="plan-timeline-now" style={{ left: `${pct}%` }} />
          <span className="plan-timeline-start">Start</span>
          <span className="plan-timeline-end">Maturity</span>
        </div>
      </div>
    </section>
  );
}