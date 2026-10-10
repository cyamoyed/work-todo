/* Component tests — toast timing and undo window (port of the toast/undo
 * paths of tests/dom-behavior.test.js, plus auto-hide timing with fake
 * timers: plain toast 2800ms, undo toast UNDO_TOAST_MS = 15000ms). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { UNDO_TOAST_MS } from '../../src/constants.js';

const PLAIN_TOAST_MS = 2800; // internal to src/store/ui.js

let wrapper;
let ui;

beforeEach(async () => {
  resetState();
  ({ wrapper, ui } = await mountApp());
});

afterEach(async () => {
  await cleanup(); // also restores real timers
});

const toast = () => wrapper.find('#toast');

describe('plain toast', () => {
  it('shows message without an action button and auto-hides after 2800ms', async () => {
    vi.useFakeTimers();
    ui.showToast('已存入今天');
    await nextTick();

    expect(toast().element.hidden).toBe(false);
    expect(toast().text()).toContain('已存入今天');
    expect(toast().find('button').exists()).toBe(false);

    vi.advanceTimersByTime(PLAIN_TOAST_MS - 1);
    await nextTick();
    expect(toast().element.hidden).toBe(false); // still visible just before the deadline

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(toast().element.hidden).toBe(true); // auto-hidden at 2800ms
  });
});

describe('undo toast', () => {
  it('renders the 撤销 action button and stays open for the full 15s window', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    ui.showToast('已删除「样例」', '撤销', onAction);
    await nextTick();

    const btn = toast().find('button');
    expect(btn.exists()).toBe(true); // action button present
    expect(btn.text()).toBe('撤销');

    vi.advanceTimersByTime(UNDO_TOAST_MS - 1);
    await nextTick();
    expect(toast().element.hidden).toBe(false); // open right up to the deadline
    expect(onAction).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(toast().element.hidden).toBe(true); // auto-hides at 15000ms
    expect(onAction).not.toHaveBeenCalled(); // expiry must not fire the action
  });

  it('clicking 撤销 runs the action immediately and hides the toast', async () => {
    vi.useFakeTimers();
    const onAction = vi.fn();
    ui.showToast('已删除「样例」', '撤销', onAction);
    await nextTick();

    await toast().find('button').trigger('click');
    await nextTick();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(toast().element.hidden).toBe(true);
  });

  it('delete flow undo restores the task within the window', async () => {
    const { tasks } = await mountApp(); // fresh list for this scenario
    vi.useFakeTimers();
    tasks.createTask({ title: '限时可撤销' });
    await nextTick();
    await wrapper.find('.task-card [aria-label="删除任务"]').trigger('click');
    await nextTick();
    await wrapper.find('#btn-confirm-ok').trigger('click');
    await nextTick();

    expect(tasks.state.tasks.length).toBe(0);
    expect(toast().text()).toContain('撤销');

    await toast().find('button').trigger('click');
    await nextTick();
    expect(tasks.state.tasks.map((t) => t.title)).toEqual(['限时可撤销']);
    expect(toast().element.hidden).toBe(true);
  });
});
