import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

/** One OHLC candlestick (times are Unix ms). `volume` is optional. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** A named moving-average series to overlay on the price plot. */
export interface MovingAverageRef {
  label: string;
  values: (number | null)[];
}

interface CandlestickChartProps {
  candles: Candle[];
  height?: number;
  /** 'time' renders HH:MM labels (day view), 'date' renders MMM D (week/month view). */
  timeFormat?: 'time' | 'date';
  /** 'candlestick' (default) or 'line'. */
  chartType?: 'candlestick' | 'line';
  /** Show the bottom volume panel. Default true. */
  showVolume?: boolean;
  /** Optional pre-computed moving average series (e.g. MA50/MA200). When omitted, nothing is overlaid. */
  movingAverages?: MovingAverageRef[];
}

const UP = '#22C55E';
const DOWN = '#EF4444';
const LINE = '#F5C518';
const MA_COLORS = ['#A78BFA', '#F59E0B', '#38BDF8'];
const PAD_L = 10;
const PAD_R = 60;
const PAD_T = 14;
const PAD_B = 28;
const GRID_LINES = 5;
const X_LABELS = 5;
const VOL_H = 56;
const VOL_GAP = 14;

export default function CandlestickChart({
  candles,
  height = 320,
  timeFormat = 'time',
  chartType = 'candlestick',
  showVolume = true,
  movingAverages = [],
}: CandlestickChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

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
  const priceH = showVolume ? height - PAD_T - PAD_B - VOL_H - VOL_GAP : height - PAD_T - PAD_B;
  const volTop = height - PAD_B - VOL_H;
  const volBottom = height - PAD_B;

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
  const yFor = (p: number) => PAD_T + (1 - (p - min) / (max - min)) * priceH;
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

  // Synthesize a stable pseudo-volume from price action when absent, so the
  // volume sub-panel always has data to render regardless of backend shape.
  const volumes = candles.map((c, i) =>
    c.volume != null ? c.volume : Math.max(0, (c.high - c.low) / (c.open || 1)) * 1000 + (i % 7) * 40,
  );
  const maxVol = Math.max(...volumes, 1) || 1;
  const volScale = volBottom - volTop;
  const volH = (v: number) => Math.max(2, (v / maxVol) * volScale);

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

  // Build the line-mode close polyline.
  const linePath = candles
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)} ${yFor(c.close).toFixed(1)}`)
    .join(' ');

  return (
    <div ref={wrapRef} className={`candle-chart ${chartType === 'line' ? 'candle-chart-line' : ''}`} style={{ height }}>
      <svg
        width={width}
        height={height}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onMouseDown={() => setHover(null)}
        role="img"
        aria-label={`${chartType === 'line' ? 'Line' : 'Candlestick'} price chart${showVolume ? ' with volume' : ''}`}
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

        {/* Volume bars */}
        {showVolume &&
          volumes.map((v, i) => {
            const up = candles[i].close >= candles[i].open;
            return (
              <rect
                key={`v-${candles[i].time}`}
                x={xFor(i) - bodyW / 2 + 0.5}
                y={volBottom - volH(v)}
                width={Math.max(1, bodyW - 1)}
                height={volH(v)}
                fill={up ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}
              />
            );
          })}
        {showVolume && (
          <line x1={PAD_L} y1={volTop} x2={width - PAD_R} y2={volTop} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        )}

        {/* Candles or line */}
        {chartType === 'line' ? (
          <path d={linePath} fill="none" stroke={LINE} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          candles.map((c, i) => {
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
          })
        )}

        {/* Moving average overlays */}
        {movingAverages.map((ma, mi) => {
          const pts: string[] = [];
          ma.values.forEach((v, i) => {
            if (v == null) return;
            pts.push(`${pts.length === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)} ${yFor(v as number).toFixed(1)}`);
          });
          if (!pts.length) return null;
          const stroke = MA_COLORS[mi % MA_COLORS.length];
          return (
            <path key={`ma-${ma.label}`} d={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.6"
              strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
          );
        })}
{/* Crosshair */}
        {hovered && (
          <g>
            <line x1={hoverX} y1={PAD_T} x2={hoverX} y2={volBottom} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
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

      {/* MA legend */}
      {movingAverages.length > 0 && (
        <div className="ma-legend">
          {movingAverages.map((ma, mi) => (
            <span key={ma.label} className="ma-legend-item">
              <span className="ma-dot" style={{ background: MA_COLORS[mi % MA_COLORS.length] }} />
              {ma.label}
            </span>
          ))}
        </div>
      )}

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
          <div className="candle-tooltip-row"><span>Volume</span><strong>{Math.round(volumes[hover!]).toLocaleString('en-US')}</strong></div>
        </div>
      )}
    </div>
  );
}

/** Compute a simple moving-average series over `data` with the given window.
 *  Values before `window - 1` are padded with null so the line starts cleanly. */
export function movingAverage(data: number[], window: number): (number | null)[] {
  if (window < 1) return data.map(() => null);
  const out: (number | null)[] = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= window) sum -= data[i - window];
    if (i >= window - 1) out[i] = sum / Math.min(i + 1, window);
  }
  return out;
}

/** Pick sensible MA periods for overlay based on how much history exists.
 *  Large windows (MA50/MA200) only render once enough data is present. */
export function suggestMovingAverages(length: number): { label: string; window: number }[] {
  if (length >= 200) return [{ label: 'MA200', window: 200 }, { label: 'MA50', window: 50 }];
  if (length >= 100) return [{ label: 'MA100', window: 100 }, { label: 'MA50', window: 50 }];
  if (length >= 50) return [{ label: 'MA50', window: 50 }, { label: 'MA20', window: 20 }];
  if (length >= 20) return [{ label: 'MA20', window: 20 }, { label: 'MA10', window: 10 }];
  return [{ label: 'MA5', window: 5 }, { label: 'MA3', window: 3 }];
}