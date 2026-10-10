/* Component tests — custom titlebar window controls (desktop-only). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TitleBarControls from '../../src/components/TitleBarControls.vue';
import { isTauri } from '../../src/lib/tauri.js';

vi.mock('../../src/lib/tauri.js', () => ({
  isTauri: vi.fn(() => true),
  minimizeWindow: vi.fn(),
  toggleMaximizeWindow: vi.fn(),
  closeWindow: vi.fn(),
  isWindowMaximized: vi.fn(async () => false),
  onWindowResized: vi.fn(async () => () => {}),
}));

beforeEach(() => {
  vi.clearAllMocks();
  isTauri.mockReturnValue(true);
});

describe('TitleBarControls', () => {
  it('renders three window buttons in Tauri', async () => {
    const wrapper = mount(TitleBarControls);
    await wrapper.vm.$nextTick();
    const btns = wrapper.findAll('.win-btn');
    expect(btns.length).toBe(3);
    expect(btns[0].attributes('aria-label')).toBe('最小化窗口');
    expect(btns[1].attributes('aria-label')).toBe('最大化窗口');
    expect(btns[2].attributes('aria-label')).toBe('关闭窗口');
  });

  it('clicks invoke the window plugin helpers', async () => {
    const { minimizeWindow, toggleMaximizeWindow, closeWindow } = await import('../../src/lib/tauri.js');
    const wrapper = mount(TitleBarControls);
    await wrapper.vm.$nextTick();
    const btns = wrapper.findAll('.win-btn');
    await btns[0].trigger('click');
    await btns[1].trigger('click');
    await btns[2].trigger('click');
    expect(minimizeWindow).toHaveBeenCalledTimes(1);
    expect(toggleMaximizeWindow).toHaveBeenCalledTimes(1);
    expect(closeWindow).toHaveBeenCalledTimes(1);
  });

  it('renders nothing outside Tauri (browser)', async () => {
    isTauri.mockReturnValue(false);
    const wrapper = mount(TitleBarControls);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.win-controls').exists()).toBe(false);
  });
});
