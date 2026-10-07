import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./motion";

/** A soft light that follows the pointer over an element. It only sets two CSS variables
 *  (--mx, --my); the glow itself is drawn by CSS. Setting them through the CSSOM is allowed
 *  by the Content-Security-Policy (only inline style *attributes* in markup are blocked). */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;
    const move = (event: PointerEvent) => {
      const box = element.getBoundingClientRect();
      element.style.setProperty("--mx", `${event.clientX - box.left}px`);
      element.style.setProperty("--my", `${event.clientY - box.top}px`);
    };
    element.addEventListener("pointermove", move);
    return () => element.removeEventListener("pointermove", move);
  }, []);

  return ref;
}
