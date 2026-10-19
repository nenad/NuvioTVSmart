// Compact layouts: canvases narrower than the TV layout's smallest breakpoint,
// which means phones in portrait and narrow desktop windows. Keep this query
// in step with the @media block in css/components-61.css.
export const COMPACT_LAYOUT_QUERY = "(max-width: 1099px)";

const SWITCHING_CLASS = "layout-switching";

// A touch screen as the primary pointer: phones and tablets, in either
// orientation. TVs (remote, Magic Remote) and desktops (mouse) are not.
export function isTouchScreen() {
  try {
    return Boolean(globalThis.matchMedia?.("(pointer: coarse)")?.matches);
  } catch (_) {
    return false;
  }
}

export function isCompactLayout() {
  try {
    return Boolean(globalThis.matchMedia?.(COMPACT_LAYOUT_QUERY)?.matches);
  } catch (_) {
    return false;
  }
}

// Rotating a phone crosses the breakpoint, and every property that differs
// between the two layouts would animate from one to the other: the tab bar,
// for one, sweeps in from full width as the TV rail. By the time the media
// query reports the change, the browser has usually started those
// transitions already, so finish them; and suspend transitions
// (css/components-61.css) for the next frames, which restyle the rest.
function finishRunningTransitions() {
  const CSSTransitionCtor = globalThis.CSSTransition;
  if (typeof document.getAnimations !== "function" || typeof CSSTransitionCtor !== "function") {
    return;
  }
  document.getAnimations().forEach((animation) => {
    if (animation instanceof CSSTransitionCtor) {
      animation.finish();
    }
  });
}

export function installCompactLayoutTransitionGuard() {
  const query = globalThis.matchMedia?.(COMPACT_LAYOUT_QUERY);
  const root = globalThis.document?.documentElement;
  if (!query || !root) {
    return;
  }
  const suspend = () => {
    root.classList.add(SWITCHING_CLASS);
    finishRunningTransitions();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove(SWITCHING_CLASS));
    });
  };
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", suspend);
  } else if (typeof query.addListener === "function") {
    query.addListener(suspend);
  }
}
