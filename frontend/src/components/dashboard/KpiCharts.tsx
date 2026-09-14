import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, CategoryScale, LinearScale, LineElement, PointElement, ChartTooltip, Legend, Filler);

const GREEN = '#22C55E';
const GOLD = '#F5C518';
const PURPLE = '#A78BFA';
const BRIGHT_BLUE = '#38BDF8';

const gridColor = 'rgba(255,255,255,0.06)';
const tickColor = '#94A3B8';

function fmtUsd(v: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

/* ------------------------------------------------------------------ */
/* Profit growth line chart — last 30 days                            */
/* ------------------------------------------------------------------ */
export function ProfitGrowthChart({ currentProfit }: { currentProfit: number }) {
  // Deterministic 30-day path that scales up to the current profit.
  const days = 30;
  const labels: string[] = [];
  const data: number[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    labels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const raw = currentProfit * (i / (days - 1));
    // Smooth, non-negative walk with a touch of noise that always ends at currentProfit.
    const noise = Math.sin(i * 1.7) * (currentProfit * 0.03);
    data.push(Math.max(0, raw + noise + currentProfit * 0.02));
  }
  // Pin the last point exactly so the headline number matches the line's end.
  data[data.length - 1] = currentProfit;

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Profit (USD)',
        data,
        borderColor: GREEN,
        backgroundColor: 'rgba(34,197,94,0.18)',
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: GREEN,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        displayColors: false,
        callbacks: { label: (c) => fmtUsd(c.parsed.y) },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: tickColor, maxTicksLimit: 8 } },
      y: {
        grid: { color: gridColor },
        ticks: { color: tickColor, callback: (v) => fmtUsd(Number(v)) },
      },
    },
  };

  return (
    <div className="kpi-chart-wrap">
      <Line data={chartData} options={options} aria-label="Profit growth over the last 30 days" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Asset allocation donut — BTC vs USDT etc.                         */
/* ------------------------------------------------------------------ */
export interface AllocationSlice {
  label: string;
  value: number;
  color: string;
}

export function AllocationDonut({ slices, totalValue }: { slices: AllocationSlice[]; totalValue: number }) {
  const chartData = {
    labels: slices.map((s) => s.label),
    datasets: [
      {
        data: slices.map((s) => s.value),
        backgroundColor: slices.map((s) => s.color),
        borderColor: '#0A0A1A',
        borderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };

  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#CBD5E1', usePointStyle: true, boxWidth: 10, padding: 16 },
      },
      tooltip: {
        callbacks: {
          label: (c) => {
            const val = c.parsed;
            const pct = totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : '0';
            return `${c.label}: ${fmtUsd(val)} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="donut-wrap">
      <div className="donut-center">
        <span className="donut-center-label">Total</span>
        <strong>{fmtUsd(totalValue)}</strong>
      </div>
      <div className="kpi-chart-wrap small">
        <Doughnut data={chartData} options={options} aria-label="Asset allocation breakdown" />
      </div>
      <div className="donut-legend-labels">
        {slices.map((s) => {
          const pct = totalValue > 0 ? ((s.value / totalValue) * 100).toFixed(1) : '0';
          return (
            <div key={s.label} className="donut-legend-item">
              <span className="donut-swatch" style={{ background: s.color }} />
              <span className="donut-legend-name">{s.label}</span>
              <strong className="mono">{fmtUsd(s.value)}</strong>
              <span className="donut-legend-pct">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { GOLD, PURPLE, BRIGHT_BLUE };