import { useEffect, useRef } from 'react';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  gold: boolean;
  a: number;
}

/**
 * Faint drifting particle field for the hero — gold/purple dots evoking
 * "data/algorithmic". Canvas-based (cheap), pauses when the tab is hidden,
 * disabled entirely for prefers-reduced-motion. Uses only brand colors.
 */
export default function HeroParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = canvas.offsetHeight);
    let raf = 0;
    let running = true;

    const N = Math.min(70, Math.floor(w / 22));
    const particles: P[] = Array.from({ length: N }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.22,
      vy: -0.08 - Math.random() * 0.22,
      r: 0.8 + Math.random() * 1.8,
      gold: Math.random() > 0.45,
      a: 0.12 + Math.random() * 0.3,
    }));

    const onResize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    const onVisibility = () => {
      running = !document.hidden;
      if (running) raf = requestAnimationFrame(tick);
    };

    const tick = () => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.gold ? `rgba(245, 197, 24, ${p.a})` : `rgba(167, 139, 250, ${p.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'none' }}
    />
  );
}
