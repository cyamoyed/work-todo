/* work-todo — DOM adapters that keep popups inside the window / their modal */
import { placePopup, shiftIntoBox } from '../core/popup.js';

function viewportBox() {
  return { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
}

/** Reposition a teleported absolute menu under its anchor after render,
 * writing the clamped page coordinates back into the reactive menu state. */
export function placeMenuInViewport(el, anchor, menu, opts = {}) {
  if (!el || !anchor) return;
  const rect = el.getBoundingClientRect();
  const pos = placePopup(anchor, { width: rect.width, height: rect.height }, viewportBox(), opts);
  menu.top = pos.top + (window.scrollY || 0);
  menu.left = pos.left + (window.scrollX || 0);
}

/** Nudge an already-placed (CSS-anchored) popup fully inside a container with
 * a one-off translate; container falls back to the window. Resetting the
 * transform before measuring keeps repeated opens from accumulating offsets. */
export function clampWithinContainer(el, container, margin = 8) {
  if (!el) return;
  el.style.transform = '';
  const box = container ? container.getBoundingClientRect() : viewportBox();
  const { dx, dy } = shiftIntoBox(el.getBoundingClientRect(), box, margin);
  if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`;
}
