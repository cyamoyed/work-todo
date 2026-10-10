/* Unit tests — theme CSS structure in styles.css: the explicit
 * [data-theme="dark"] block and the prefers-color-scheme fallback must define
 * the exact same token set as the light block (no half-themed tokens). */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Normalize CRLF (Windows checkouts) so selector needles and brace scanning
// don't depend on the user's core.autocrlf setting.
const css = fs
  .readFileSync(path.join(repoRoot, 'styles.css'), 'utf8')
  .replace(/\r\n/g, '\n');

/** Extract the full `{...}` body of the first block whose selector list contains `needle`. */
function blockBody(needle) {
  const start = css.indexOf(needle);
  expect(start).toBeGreaterThanOrEqual(0);
  const braceOpen = css.indexOf('{', start);
  let depth = 0;
  for (let i = braceOpen; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(braceOpen + 1, i);
    }
  }
  throw new Error('unbalanced braces after: ' + needle);
}

const tokenKeys = (body) =>
  Array.from(body.matchAll(/(--[\w-]+)\s*:/g), (m) => m[1]).sort();

describe('theme CSS tokens', () => {
  const lightBody = blockBody(':root,\n[data-theme="light"]');
  const darkBody = blockBody('[data-theme="dark"]');
  const mediaBody = blockBody(':root:not([data-theme="light"]):not([data-theme="dark"])');

  it('light and dark blocks define the identical token key set', () => {
    expect(tokenKeys(darkBody)).toEqual(tokenKeys(lightBody));
  });

  it('the system-following media block is in lockstep with the dark block', () => {
    expect(tokenKeys(mediaBody)).toEqual(tokenKeys(darkBody));
  });

  it('both dark variants opt into dark native chrome', () => {
    expect(darkBody).toContain('color-scheme: dark');
    expect(mediaBody).toContain('color-scheme: dark');
  });

  it('dark really inverts surfaces and text', () => {
    const value = (body, key) =>
      (body.match(new RegExp(`${key}\\s*:\\s*([^;]+);`)) || [])[1];
    // text brighter than surfaces in dark
    expect(value(darkBody, '--ink')).not.toBe(value(lightBody, '--ink'));
    expect(value(darkBody, '--panel')).not.toBe(value(lightBody, '--panel'));
    // accent stays in the indigo family in both themes
    expect(value(lightBody, '--accent')).toMatch(/#4f46e5/i);
    expect(value(darkBody, '--accent')).toMatch(/#6366f1/i);
  });

  it('geometry tokens (radius/font/row heights) live outside the theme blocks', () => {
    expect(lightBody).not.toContain('--radius');
    expect(darkBody).not.toContain('--radius');
    expect(css).toContain('--row-h: 62px');
  });

  it('the whole stylesheet is brace-balanced (a stray } makes browsers drop following rules)', () => {
    // v0.7.0 shipped two stray top-level closers after the theme blocks; the
    // browser's error recovery silently ate the @media fallback and the
    // geometry :root, leaving --side-w undefined and the shell single-column.
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const open = (noComments.match(/{/g) || []).length;
    const close = (noComments.match(/}/g) || []).length;
    expect(close).toBe(open);
  });
});
