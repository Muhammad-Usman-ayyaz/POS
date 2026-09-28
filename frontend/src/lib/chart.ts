import {
  ArcElement, BarElement, CategoryScale, Chart, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';

Chart.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);

/** Chart.js's own animation loop, disabled when the user asked for reduced motion. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const chartAnimation = (): false | { duration: number } => (prefersReducedMotion() ? false : { duration: 400 });

/** Reads a CSS custom property off :root, so charts follow the same tokens (and dark mode) as the rest of the app. */
export const cssVar = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};
