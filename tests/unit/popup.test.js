import { describe, it, expect } from 'vitest';
import { placePopup, shiftIntoBox } from '../../src/core/popup.js';

const BOX = { top: 0, left: 0, right: 1280, bottom: 800 };

describe('placePopup', () => {
  it('places below-left of the anchor when there is room', () => {
    const anchor = { top: 100, bottom: 130, left: 200, right: 260 };
    const pop = { width: 220, height: 100 };
    expect(placePopup(anchor, pop, BOX)).toEqual({ top: 136, left: 200 });
  });

  it('flips above when the bottom would overflow', () => {
    const anchor = { top: 720, bottom: 750, left: 200, right: 260 };
    const pop = { width: 220, height: 100 };
    // below: 756 + 100 = 856 > 792; above: 720 - 6 - 100 = 614 >= 8
    expect(placePopup(anchor, pop, BOX)).toEqual({ top: 614, left: 200 });
  });

  it('clamps into the box when neither side fully fits', () => {
    const anchor = { top: 700, bottom: 760, left: 200, right: 260 };
    const pop = { width: 220, height: 700 };
    // below 766+700 > 792, above 700-706=-6 < 8 → clamp below to 800-8-700
    expect(placePopup(anchor, pop, BOX)).toEqual({ top: 92, left: 200 });
  });

  it('clamps horizontally when the anchor sits at the right edge', () => {
    const anchor = { top: 100, bottom: 130, left: 1200, right: 1260 };
    const pop = { width: 220, height: 100 };
    expect(placePopup(anchor, pop, BOX).left).toBe(1280 - 8 - 220);
  });

  it('honours align:end, clamped to the left margin', () => {
    const anchor = { top: 100, bottom: 130, left: 40, right: 100 };
    const pop = { width: 220, height: 100 };
    // end: 100-220 = -120 → clamped to 8
    expect(placePopup(anchor, pop, BOX, { align: 'end' }).left).toBe(8);
  });

  it('honours a custom box (e.g. a modal) and margin', () => {
    const box = { top: 100, left: 200, right: 800, bottom: 700 };
    const anchor = { top: 640, bottom: 680, left: 300, right: 360 };
    const pop = { width: 280, height: 300 };
    // below: 686+300 > 692 → above: 640-6-300=334 >= 108 → top 334
    expect(placePopup(anchor, pop, box, { margin: 12 })).toEqual({ top: 334, left: 300 });
  });
});

describe('shiftIntoBox', () => {
  it('returns zeros when the rect already fits', () => {
    expect(shiftIntoBox({ top: 10, bottom: 110, left: 20, right: 240 }, BOX)).toEqual({ dx: 0, dy: 0 });
  });

  it('shifts up when the bottom overflows', () => {
    expect(shiftIntoBox({ top: 750, bottom: 850, left: 20, right: 240 }, BOX)).toEqual({ dx: 0, dy: -58 });
  });

  it('shifts left when the right overflows', () => {
    expect(shiftIntoBox({ top: 10, bottom: 110, left: 1200, right: 1420 }, BOX)).toEqual({ dx: -148, dy: 0 });
  });

  it('shifts right/down for negative overflow', () => {
    expect(shiftIntoBox({ top: -20, bottom: 80, left: -30, right: 190 }, BOX)).toEqual({ dx: 38, dy: 28 });
  });

  it('pins to the left/top margins when the rect is bigger than the box', () => {
    const box = { top: 0, left: 0, right: 500, bottom: 400 };
    const rect = { top: 0, bottom: 600, left: 0, right: 800 };
    expect(shiftIntoBox(rect, box)).toEqual({ dx: 8, dy: 8 });
  });
});
