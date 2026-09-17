import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * Custom cursor: a small gold dot that trails the pointer, scaling up ~2.5x
 * and softening while hovering any interactive element (a, button, [data-cursor],
 * summary, input). Disabled on touch devices and for prefers-reduced-motion.
 * The native cursor stays visible (accessibility) — this is an accent, not a
 * replacement.
 */
export default function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 500, damping: 40, mass: 0.4 });

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reduced) return;

    setEnabled(true);

    const onMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      const target = e.target as HTMLElement | null;
      setHovering(
        !!target?.closest('a, button, summary, input, textarea, select, .card, [role="button"], [data-cursor="hover"]'),
      );
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: hovering ? 'var(--purple-light)' : 'var(--gold)',
        boxShadow: `0 0 14px ${hovering ? 'rgba(167, 139, 250, 0.55)' : 'rgba(245, 197, 24, 0.55)'}`,
        zIndex: 2000,
        pointerEvents: 'none',
        translateX: '-50%',
        translateY: '-50%',
        x: sx,
        y: sy,
      }}
      animate={{ scale: hovering ? 2.5 : 1, opacity: hovering ? 0.75 : 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
    />
  );
}
