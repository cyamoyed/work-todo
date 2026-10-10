/* Component tests — theme switcher in the side nav (and mobile drawer). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { useThemeStore } from '../../src/store/theme.js';
import { THEME_KEY } from '../../src/constants.js';

let wrapper;

beforeEach(async () => {
  resetState();
  ({ wrapper } = await mountApp());
});

afterEach(async () => {
  await cleanup();
  useThemeStore().__resetForTests();
});

describe('theme toggle', () => {
  it('renders three options with 跟随系统 active by default', () => {
    const options = wrapper.findAll('.side .theme-option'); // drawer has its own copy
    expect(options.length).toBe(3);
    const values = options.map((o) => o.attributes('data-value'));
    expect(values).toEqual(['system', 'light', 'dark']);
    expect(options[0].classes()).toContain('active');
    expect(document.documentElement.getAttribute('data-theme')).toBe(null);
  });

  it('clicking 深色 pins data-theme=dark and persists the choice', async () => {
    await wrapper.find('.side .theme-option[data-value="dark"]').trigger('click');
    await flushPromises();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('"dark"');
    expect(wrapper.find('.side .theme-option[data-value="dark"]').classes()).toContain('active');
  });

  it('back to 跟随系统 removes the attribute', async () => {
    await wrapper.find('.side .theme-option[data-value="dark"]').trigger('click');
    await wrapper.find('.side .theme-option[data-value="system"]').trigger('click');
    await flushPromises();
    expect(document.documentElement.getAttribute('data-theme')).toBe(null);
    expect(localStorage.getItem(THEME_KEY)).toBe('"system"');
  });

  it('mobile drawer carries its own switcher', async () => {
    const drawerOptions = wrapper.findAll('#mobile-drawer .theme-option');
    expect(drawerOptions.length).toBe(3);
    await drawerOptions[2].trigger('click'); // dark
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
