import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right' | 'fade';

const offsets: Record<Exclude<Direction, 'fade'>, { x?: number; y?: number }> = {
  up: { y: 36 },
  down: { y: -36 },
  left: { x: -48 },
  right: { x: 48 },
};

/**
 * Scroll-reveal wrapper (replaces the old data-reveal/IntersectionObserver
 * system on the home page). Fades + slides the child in the first time it
 * enters the viewport. Reduced motion → plain fade, instantly visible.
 */
export default function Reveal({
  children,
  direction = 'up',
  delay = 0,
  className,
  style,
}: {
  children: ReactNode;
  direction?: Direction;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduced = useReducedMotion();
  const offset = reduced ? { y: 0, x: 0 } : offsets[direction === 'fade' ? 'up' : direction];

  const variants: Variants = {
    hidden: { opacity: 0, x: offset.x ?? 0, y: offset.y ?? 0 },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: reduced ? 0.2 : 0.7, delay, ease: [0.21, 0.6, 0.35, 1] },
    },
  };

  return (
    <motion.div
      className={className}
      style={{ ...style, willChange: 'transform, opacity' }}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
    >
      {children}
    </motion.div>
  );
}
