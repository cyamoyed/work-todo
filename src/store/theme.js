/* work-todo — theme setting: system | light | dark (localStorage-persisted)
 *
 * 'system' (default) removes the data-theme attribute so the CSS
 * prefers-color-scheme media query drives the palette; explicit choices pin
 * data-theme="light|dark" on <html>. index.html applies the stored choice
 * before first paint; this store re-applies it and tracks the resolved theme.
 */

import { reactive } from 'vue';
import { THEME_KEY, THEME_SETTINGS } from '../constants.js';

const state = reactive({
  setting: 'system', // system | light | dark — the user's choice
  resolved: 'light', // what is actually on screen (system → matchMedia)
});

let inited = false;

function readSetting() {
  try {
    const v = JSON.parse(localStorage.getItem(THEME_KEY) || '""');
    return THEME_SETTINGS.includes(v) ? v : 'system';
  } catch (_) {
    return 'system';
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

function apply() {
  if (typeof document !== 'undefined' && document.documentElement) {
    if (state.setting === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', state.setting);
  }
  state.resolved =
    state.setting === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : state.setting;
}

export function useThemeStore() {
  return {
    state,

    /** Idempotent: read storage, apply, and follow OS theme changes while on system. */
    init() {
      if (inited) return;
      inited = true;
      state.setting = readSetting();
      apply();
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => {
          if (state.setting === 'system') apply();
        };
        if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange);
        else if (typeof media.addListener === 'function') media.addListener(onChange);
      }
    },

    setTheme(setting) {
      state.setting = THEME_SETTINGS.includes(setting) ? setting : 'system';
      try {
        localStorage.setItem(THEME_KEY, JSON.stringify(state.setting));
      } catch (_) {
        /* ignore — theme just won't persist */
      }
      apply();
    },

    /** Test hook: back to fresh-boot state (also re-arms init). */
    __resetForTests() {
      inited = false;
      state.setting = 'system';
      state.resolved = 'light';
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.removeAttribute('data-theme');
      }
    },
  };
}
