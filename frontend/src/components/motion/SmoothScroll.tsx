import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Lenis from 'lenis';

/**
 * Site-wide smooth inertia scrolling (lenis).
 *
 * - Runs a single rAF loop for the whole app.
 * - Resets scroll position to the top on route change (replaces the browser's
 *   native jump so anchors feel consistent with the inertia scroll).
 * - Automatically no-ops when the user prefers reduced motion.
 */
export default function SmoothScroll() {
  const lenisRef = useRef<Lenis | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({
      duration: 1.15,
      // Expo-out feels like Stripe/Linear inertia.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.4,
    });
    lenisRef.current = lenis;

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // New route → jump to top (immediate, no smooth animation).
  useEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}
