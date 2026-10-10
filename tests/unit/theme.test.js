/* Unit tests — theme store: persistence, html attribute, system following. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useThemeStore } from '../../src/store/theme.js';
import { THEME_KEY } from '../../src/constants.js';

const store = useThemeStore();

beforeEach(() => {
  localStorage.clear();
  store.__resetForTests();
});

afterEach(() => {
  store.__resetForTests();
  vi.restoreAllMocks();
});

describe('theme store', () => {
  it('defaults to system with no data-theme attribute', () => {
    store.init();
    expect(store.state.setting).toBe('system');
    expect(store.state.resolved).toBe('light'); // happy-dom does not prefer dark
    expect(document.documentElement.getAttribute('data-theme')).toBe(null);
  });

  it('setTheme dark pins the attribute and persists JSON', () => {
    store.setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(store.state.resolved).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('"dark"');
  });

  it('setTheme light pins light; back to system removes the attribute', () => {
    store.setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    store.setTheme('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe(null);
    expect(localStorage.getItem(THEME_KEY)).toBe('"system"');
  });

  it('ignores unknown settings and corrupt storage', () => {
    localStorage.setItem(THEME_KEY, '"hotdog"');
    store.init();
    expect(store.state.setting).toBe('system');

    localStorage.setItem(THEME_KEY, 'not-json');
    store.__resetForTests();
    store.init();
    expect(store.state.setting).toBe('system');

    expect(store.state.setting).toBe('system');
    store.setTheme('neon');
    expect(store.state.setting).toBe('system');
  });

  it('init restores a stored explicit theme', () => {
    localStorage.setItem(THEME_KEY, '"dark"');
    store.init();
    expect(store.state.setting).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('follows the OS preference while on system', () => {
    let listener = null;
    const media = {
      matches: true, // OS is dark
      addEventListener: (ev, fn) => {
        if (ev === 'change') listener = fn;
      },
    };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    store.init();
    expect(store.state.setting).toBe('system');
    expect(store.state.resolved).toBe('dark'); // resolved from matchMedia

    // OS flips to light → system setting tracks it live
    media.matches = false;
    if (listener) listener();
    expect(store.state.resolved).toBe('light');

    // an explicit choice ignores OS flips
    store.setTheme('dark');
    media.matches = false;
    if (listener) listener();
    expect(store.state.resolved).toBe('dark');
    vi.unstubAllGlobals();
  });
});
