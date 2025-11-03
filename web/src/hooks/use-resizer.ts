import { useEffect, useRef } from "react";

/**
 * This hook uses `requestAnimationFrame` to delay the observer setup until
 * after the DOM ref has been mounted. This avoids the common issue where
 * `ref.current` is `null` on initial render, which causes the ResizeObserver
 * to never attach if you check the ref immediately in `useEffect`.
 */
export function useResizeObserver(
  ref: React.RefObject<HTMLElement>,
  onResize: () => void
) {
  const timeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let frame: number;
    let observer: ResizeObserver | undefined;

    function debouncedResize() {
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(onResize, 50);
    }

    function tryObserve() {
      if (!ref.current) {
        frame = requestAnimationFrame(tryObserve);
        return;
      }

      observer = new ResizeObserver(debouncedResize);
      observer.observe(ref.current);
    }

    frame = requestAnimationFrame(tryObserve);

    return () => {
      cancelAnimationFrame(frame);
      if (timeout.current) clearTimeout(timeout.current);
      observer?.disconnect();
    };
  }, [ref, onResize]);
}
