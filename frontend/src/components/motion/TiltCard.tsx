import { useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Max rotation in degrees. */
  max?: number;
}

/**
 * 3D tilt-on-hover card (Stripe/Linear pricing-card style). Rotates in
 * perspective following the cursor within the card bounds, with a shifting
 * gold glare. Disabled for reduced motion and touch (pointer: coarse).
 */
export default function TiltCard({ children, className, style, max = 10 }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [canTilt, setCanTilt] = useState(false);
  const [glare, setGlare] = useState({ x: 50, y: 50, o: 0 });

  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 300, damping: 24 });
  const sry = useSpring(ry, { stiffness: 300, damping: 24 });

  const onEnter = () => {
    if (reduced) return;
    setCanTilt(window.matchMedia('(pointer: fine)').matches);
  };

  const onMove = (e: MouseEvent) => {
    if (!canTilt || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    ry.set((px - 0.5) * 2 * max);
    rx.set(-(py - 0.5) * 2 * max);
    setGlare({ x: px * 100, y: py * 100, o: 1 });
  };

  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    setGlare((g) => ({ ...g, o: 0 }));
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        ...style,
        transformStyle: 'preserve-3d',
        transformPerspective: 900,
        rotateX: srx,
        rotateY: sry,
      }}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {children}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          pointerEvents: 'none',
          opacity: glare.o,
          transition: 'opacity 0.4s ease',
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(245,197,24,0.14), transparent 55%)`,
        }}
      />
    </motion.div>
  );
}
