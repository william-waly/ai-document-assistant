import { useEffect, useState } from "react";
import { prefersReducedMotion } from "../motion";

interface CountUpProps {
  value: number;
  /** Minimum number of digits, e.g. 2 gives "03". */
  pad?: number;
  durationMs?: number;
}

const format = (n: number, pad: number) => String(Math.round(n)).padStart(pad, "0");

/** A number that counts up when it first appears. The final value is always in the
 *  page for screen readers; the animated digits are decoration. With reduced motion
 *  (or no animation support) the final value is shown at once. */
export default function CountUp({ value, pad = 0, durationMs = 700 }: CountUpProps) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));

  useEffect(() => {
    if (prefersReducedMotion() || value === 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      setShown(value * (1 - Math.pow(1 - progress, 3))); // ease-out
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <>
      <span className="visually-hidden">{format(value, pad)}</span>
      <span aria-hidden="true">{format(shown, pad)}</span>
    </>
  );
}
