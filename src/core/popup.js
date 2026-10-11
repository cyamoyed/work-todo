/* work-todo — popup placement math (pure; DOM adapters live in composables) */

/**
 * Choose a position for a popup anchored to a rect, kept inside a box.
 * Prefers `prefer` side, flips to the other side when it does not fit, then
 * clamps into the box (a popup taller than the box hugs the box's top edge).
 * All inputs/outputs are plain viewport-space numbers.
 */
export function placePopup(anchor, pop, box, opts = {}) {
  const gap = opts.gap ?? 6;
  const margin = opts.margin ?? 8;
  const prefer = opts.prefer ?? 'below';
  const align = opts.align ?? 'start';

  const belowTop = anchor.bottom + gap;
  const aboveTop = anchor.top - gap - pop.height;
  const fitsBelow = belowTop + pop.height <= box.bottom - margin;
  const fitsAbove = aboveTop >= box.top + margin;
  let top = prefer === 'below' ? belowTop : aboveTop;
  if (prefer === 'below' && !fitsBelow && fitsAbove) top = aboveTop;
  else if (prefer === 'above' && !fitsAbove && fitsBelow) top = belowTop;
  top = Math.max(box.top + margin, Math.min(top, box.bottom - margin - pop.height));

  let left = align === 'end' ? anchor.right - pop.width : anchor.left;
  left = Math.max(box.left + margin, Math.min(left, box.right - margin - pop.width));

  return { top, left };
}

/** Minimal translate to bring a placed rect fully inside a box; zero axes
 * mean it already fits. When the box is narrower than the rect both sides
 * overflow — the left/top pin wins. */
export function shiftIntoBox(rect, box, margin = 8) {
  let dx = 0;
  let dy = 0;
  if (rect.right > box.right - margin) dx = box.right - margin - rect.right;
  if (rect.left + dx < box.left + margin) dx = box.left + margin - rect.left;
  if (rect.bottom > box.bottom - margin) dy = box.bottom - margin - rect.bottom;
  if (rect.top + dy < box.top + margin) dy = box.top + margin - rect.top;
  return { dx, dy };
}
