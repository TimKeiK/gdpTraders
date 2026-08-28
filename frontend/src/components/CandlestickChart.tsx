import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

/** One OHLC candlestick (times are Unix ms). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandlestickChartProps {
  candles: Candle[];
  height?: number;
  /** 'time' renders HH:MM labels (day view), 'date' renders MMM D (week/month view). */
  timeFormat?: 'time' | 'date';
}

const UP = '#22C55E';
const DOWN = '#EF4444';
const PAD_L = 10;
const PAD_R = 60;
const PAD_T = 14;
const PAD_B = 28;
const GRID_LINES = 5;
const X_LABELS = 5;

export default function CandlestickChart({
  candles,
  height = 320,
  timeFormat = 'time',
}: CandlestickChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  // Measure the container so candles are never distorted (no preserveAspectRatio="none").
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const n = candles.length;
  const plotW = Math.max(width - PAD_L - PAD_R, 0);
  const plotH = height - PAD_T - PAD_B;

  if (width === 0 || n === 0) {
    return (
      <div ref={wrapRef} className="candle-chart-empty" style={{ height }}>
        No chart data available
      </div>
    );
  }

  // Price range with breathing room.
  const prices = candles.flatMap((c) => [c.high, c.low]);
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  const pad = (max - min) * 0.08 || max * 0.01 || 1;
  min -= pad;
  max += pad;

  const xFor = (i: number) => PAD_L + (i / (n - 1)) * plotW;
  const yFor = (p: number) => PAD_T + (1 - (p - min) / (max - min)) * plotH;
  const bodyW = Math.max(2.5, (plotW / n) * 0.62);

  const grid = Array.from({ length: GRID_LINES }, (_, i) => {
    const p = min + ((max - min) * i) / (GRID_LINES - 1);
    return { y: yFor(p), price: p };
  });

  const xLabelIdxs = Array.from({ length: X_LABELS }, (_, i) =>
    Math.min(n - 1, Math.round((i / (X_LABELS - 1)) * (n - 1))),
  );

  const fmtTime = (t: number) =>
    new Date(t).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (t: number) =>
    new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtX = timeFormat === 'time' ? fmtTime : fmtDate;
  const fmtPrice = (p: number) =>
    p.toLocaleString('en-US', { maximumFractionDigits: 2 });

  const onMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = ((e.clientX - rect.left) / rect.width) * width;
    const ratio = (localX - PAD_L) / plotW;
    const idx = Math.round(ratio * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, idx)));
  };

  const hovered = hover !== null ? candles[hover] : null;
  const hoverX = hover !== null ? xFor(hover) : 0;
  const tooltipLeft = hoverX + 14;
  const tooltipLeftClamped = tooltipLeft + 224 > width ? tooltipLeft - 248 : tooltipLeft;

  const hChange = hovered ? ((hovered.close - hovered.open) / hovered.open) * 100 : 0;

  return (
    <div ref={wrapRef} className="candle-chart" style={{ height }}>
      <svg
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onMouseDown={() => setHover(null)}
      >
        {/* Horizontal grid + price labels */}
        {grid.map((g, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              y1={g.y}
              x2={width - PAD_R}
              y2={g.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
            <text x={width - PAD_R + 8} y={g.y + 4} fontSize="11" fill="rgba(255,255,255,0.45)">
              {fmtPrice(g.price)}
            </text>
          </g>
        ))}

        {/* Candles */}
        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const color = up ? UP : DOWN;
          const x = xFor(i);
          const active = hover === i;
          return (
            <g key={c.time}>
              <line
                x1={x}
                y1={yFor(c.high)}
                x2={x}
                y2={yFor(c.low)}
                stroke={color}
                strokeWidth="1"
                opacity={active ? 1 : 0.85}
              />
              <rect
                x={x - bodyW / 2}
                y={yFor(Math.max(c.open, c.close))}
                width={bodyW}
                height={Math.max(Math.abs(yFor(c.open) - yFor(c.close)), 1.5)}
                fill={color}
                opacity={active ? 1 : 0.9}
              />
            </g>
          );
        })}

        {/* Crosshair */}
        {hovered && (
          <g>
            <line
              x1={hoverX}
              y1={PAD_T}
              x2={hoverX}
              y2={height - PAD_B}
              stroke="rgba(255,255,255,0.3)"
              strokeDasharray="4 4"
            />
            <line
              x1={PAD_L}
              y1={yFor(hovered.close)}
              x2={width - PAD_R}
              y2={yFor(hovered.close)}
              stroke={hovered.close >= hovered.open ? UP : DOWN}
              strokeDasharray="4 4"
              strokeWidth="1"
            />
          </g>
        )}

        {/* Time labels */}
        {xLabelIdxs.map((idx) => (
          <text
            key={idx}
            x={xFor(idx)}
            y={height - 8}
            fontSize="11"
            fill="rgba(255,255,255,0.4)"
            textAnchor="middle"
          >
            {fmtX(candles[idx].time)}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div className="candle-tooltip" style={{ left: tooltipLeftClamped }}>
          <div className="candle-tooltip-time">
            {new Date(hovered.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
            {fmtTime(hovered.time)}
          </div>
          <div className="candle-tooltip-row"><span>Open</span><strong>{fmtPrice(hovered.open)}</strong></div>
          <div className="candle-tooltip-row"><span>High</span><strong style={{ color: UP }}>{fmtPrice(hovered.high)}</strong></div>
          <div className="candle-tooltip-row"><span>Low</span><strong style={{ color: DOWN }}>{fmtPrice(hovered.low)}</strong></div>
          <div className="candle-tooltip-row"><span>Close</span><strong>{fmtPrice(hovered.close)}</strong></div>
          <div className="candle-tooltip-row">
            <span>Change</span>
            <strong style={{ color: hChange >= 0 ? UP : DOWN }}>
              {hChange >= 0 ? '+' : ''}
              {hChange.toFixed(2)}%
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}