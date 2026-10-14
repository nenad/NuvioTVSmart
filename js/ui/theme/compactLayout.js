// Compact layouts: canvases narrower than the TV layout's smallest breakpoint,
// which means phones in portrait and narrow desktop windows. Keep this query
// in step with the @media block in css/components-61.css.
export const COMPACT_LAYOUT_QUERY = "(max-width: 1099px)";

export function isCompactLayout() {
  try {
    return Boolean(globalThis.matchMedia?.(COMPACT_LAYOUT_QUERY)?.matches);
  } catch (_) {
    return false;
  }
}
