import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

interface TrackRecordChartProps {
  labels: string[];
  portfolioData: number[];
  benchmarkData: number[];
  height?: number;
}

export default function TrackRecordChart({
  labels,
  portfolioData,
  benchmarkData,
  height = 320,
}: TrackRecordChartProps) {
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 8,
          font: {
            size: 13,
            weight: 600,
          },
          color: '#94A3B8',
        },
      },
      tooltip: {
        backgroundColor: '#050510',
        padding: 12,
        cornerRadius: 8,
        displayColors: true,
        boxPadding: 4,
        titleFont: { weight: 'bold' },
        callbacks: {
          label: (context) => {
            const value = context.parsed.y as number;
            const base = 100;
            const pct = ((value - base) / base) * 100;
            return `${context.dataset.label}: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% vs start`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#94A3B8',
          maxTicksLimit: 8,
          font: { size: 12 },
        },
      },
      y: {
        position: 'right',
        grid: {
          color: 'rgba(255, 255, 255, 0.06)',
        },
        ticks: {
          color: '#94A3B8',
          font: { size: 12 },
          callback: (value) => `${Number(value).toFixed(0)}`,
        },
      },
    },
  };

  const data = {
    labels,
    datasets: [
      {
        label: 'GDPTraders Composite',
        data: portfolioData,
        borderColor: '#F5C518',
        backgroundColor: 'rgba(245, 197, 24, 0.08)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#F5C518',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
      },
      {
        label: 'BTC Benchmark',
        data: benchmarkData,
        borderColor: '#8B5CF6',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#8B5CF6',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
      },
    ],
  };

  return (
    <div style={{ height, width: '100%' }}>
      <Line data={data} options={options} />
    </div>
  );
}