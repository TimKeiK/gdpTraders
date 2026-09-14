import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

/**
 * Celebration = lightweight canvas confetti burst + a congratulatory toast.
 *
 * Parent drives it via a monotonic `burstKey` — bump it (and pass a `message`)
 * to fire a confetti animation and show a non-intrusive toast for a few seconds.
 * Renders nothing when idle.
 */
interface CelebrationProps {
  burstKey: number;
  message: string;
  title?: string;
}

const COLORS = ['#F5C518', '#A78BFA', '#22C55E', '#38BDF8', '#F472B6', '#FB923C'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  life: number;
}

export default function Celebration({ burstKey, message, title = 'Milestone reached!' }: CelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [toast, setToast] = useState(false);
  const toastTimer = useRef<number | null>(null);

  // Fire confetti whenever burstKey changes and a message is present.
  useEffect(() => {
    if (burstKey <= 0 || !message) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx!.scale(dpr, dpr);

    const W = window.innerWidth;
    const H = window.innerHeight;
    const originX = W / 2;
    const originY = H * 0.38;
    const particles: Particle[] = [];
    // Fewer particles on small screens to avoid jank on low-end devices.
    const count = W < 768 ? 90 : 160;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 6 + Math.random() * 9;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: 4 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        life: 1,
      });
    }

    let raf = 0;
    const gravity = 0.18;
    const render = () => {
      ctx!.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of particles) {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.rot += p.vr;
        p.life -= 0.012;
        if (p.life <= 0) continue;
        alive = true;
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        ctx!.globalAlpha = Math.max(0, p.life);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6);
        ctx!.restore();
      }
      if (alive) raf = requestAnimationFrame(render);
      else ctx!.clearRect(0, 0, W, H);
    };
    render();

    return () => cancelAnimationFrame(raf);
  }, [burstKey, message]);

  // Show the toast for a moment.
  useEffect(() => {
    if (burstKey <= 0 || !message) return;
    setToast(true);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(false), 4200);
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, [burstKey, message]);

  return (
    <>
      <canvas ref={canvasRef} className="celebration-canvas" aria-hidden="true" />
      {toast && (
        <div className="celebration-toast" role="status" aria-live="polite" aria-atomic="true">
          <span className="celebration-toast-icon"><Sparkles size={18} /></span>
          <div>
            <strong>{title}</strong>
            <span className="celebration-toast-msg">{message}</span>
          </div>
          <button type="button" className="celebration-toast-close" aria-label="Dismiss" onClick={() => setToast(false)}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}