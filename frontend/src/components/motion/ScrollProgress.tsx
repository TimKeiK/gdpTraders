import { motion, useScroll, useSpring } from 'framer-motion';

/**
 * Thin gold scroll-progress bar fixed to the top of the viewport.
 * Uses a spring so the bar trails the scroll slightly instead of jittering.
 */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 32, restDelta: 0.001 });

  return (
    <motion.div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 1200,
        transformOrigin: '0% 50%',
        background: 'linear-gradient(90deg, var(--gold), var(--purple-light))',
        boxShadow: '0 0 12px rgba(245, 197, 24, 0.45)',
        scaleX,
      }}
    />
  );
}
