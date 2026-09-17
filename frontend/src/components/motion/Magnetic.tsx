import { useRef, type ReactNode, type MouseEvent } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';

interface MagneticProps {
  children: ReactNode;
  /** Max pixels the element translates toward the cursor. */
  strength?: number;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

/**
 * Magnetic hover wrapper: the child subtly translates toward the cursor within
 * a small radius and springs back on leave. Falls back to a plain static
 * wrapper for reduced motion / touch devices.
 */
export default function Magnetic({ children, strength = 14, className, style, onClick }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.5 });

  const onMove = (e: MouseEvent) => {
    if (reduced || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const max = Math.max(rect.width, rect.height) * 0.75 + 24;
    if (dist < max) {
      x.set((dx / dist) * strength * (1 - dist / max));
      y.set((dy / dist) * strength * (1 - dist / max));
    } else {
      x.set(0);
      y.set(0);
    }
  };

  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ display: 'inline-block', ...style }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      <motion.div style={{ x: sx, y: sy }}>{children}</motion.div>
    </motion.div>
  );
}
