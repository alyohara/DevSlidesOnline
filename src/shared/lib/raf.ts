/**
 * A shared "run at most once per animation frame" throttle for DOM
 * hit-testing during drags. Both dnd implementations schedule their
 * pointer-position reads (querySelectorAll + getBoundingClientRect) via
 * requestAnimationFrame and must cancel the pending frame on drop.
 */
export function createRafThrottle(fn: () => void): {
  schedule: () => void;
  cancel: () => void;
} {
  let raf = 0;
  return {
    schedule() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        fn();
      });
    },
    cancel() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
  };
}
