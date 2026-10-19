/* Component tests — task form modal (port of tests/dom-behavior.test.js form
 * sections + keyboard Escape/N). The modal is always mounted; visibility is
 * driven by the hidden attribute on #modal-backdrop. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { todayString } from '../../src/core/dates.js';

let wrapper;
let tasks;
let ui;

beforeEach(async () => {
  resetState();
  ({ wrapper, tasks, ui } = await mountApp());
});

afterEach(async () => {
  await cleanup();
});

const backdrop = () => wrapper.find('#modal-backdrop');

describe('form submit — empty title blocked', () => {
  it('shows #title-error, keeps the modal open, creates nothing', async () => {
    const before = tasks.state.tasks.length;
    ui.openTaskModal(null);
    await flushPromises();
    expect(wrapper.find('#modal-title').text()).toBe('新建任务'); // create modal title

    await wrapper.find('#field-title').setValue('   ');
    await wrapper.find('#task-form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('#title-error').element.hidden).toBe(false); // title-error visible
    expect(backdrop().element.hidden).toBe(false); // modal stays open
    expect(tasks.state.tasks.length).toBe(before); // no task created
  });
});

describe('form submit — create happy path', () => {
  it('creates a trimmed task from all fields, closes modal, toasts 任务已创建', async () => {
    ui.openTaskModal(null);
    await flushPromises();

    await wrapper.find('#field-title').setValue('  新任务  ');
    await wrapper.find('[data-status="in-progress"]').trigger('click');
    await wrapper.find('[data-priority="high"]').trigger('click');
    // due date via the calendar picker (today button)
    await wrapper.find('#btn-due').trigger('click');
    await flushPromises();
    await wrapper.find('#cal-today').trigger('click');
    await flushPromises();

    await wrapper.find('#task-form').trigger('submit');
    await flushPromises();

    const list = tasks.state.tasks;
    expect(list.length).toBe(1); // one task created
    expect(list[0].title).toBe('新任务'); // title trimmed
    expect(wrapper.find('#field-status').element.value).toBe('in-progress'); // from hidden field
    expect(list[0].status).toBe('in-progress');
    expect(wrapper.find('#field-priority').element.value).toBe('high'); // from hidden field
    expect(list[0].priority).toBe('high');
    expect(list[0].dueDate).toBe(todayString()); // dueDate from calendar picker

    expect(backdrop().element.hidden).toBe(true); // modal closed
    const toast = wrapper.find('#toast');
    expect(toast.element.hidden).toBe(false); // toast shown
    expect(toast.text()).toContain('任务已创建'); // toast text 任务已创建
  });
});

describe('form submit — create with empty dueDate', () => {
  it('stores dueDate as null when no date picked', async () => {
    ui.openTaskModal(null);
    await flushPromises();
    await wrapper.find('#field-title').setValue('无截止');
    await wrapper.find('#task-form').trigger('submit');
    await flushPromises();
    expect(tasks.state.tasks[0].dueDate).toBe(null); // dueDate null
  });
});

describe('form submit — edit path', () => {
  it('edit modal titled 编辑任务 saves in place and toasts 已保存', async () => {
    const t = tasks.createTask({ title: '旧', status: 'todo', priority: 'low', dueDate: '2026-01-01' });
    await flushPromises();

    ui.openTaskModal(t.id);
    await flushPromises();
    expect(wrapper.find('#modal-title').text()).toBe('编辑任务'); // edit modal title
    expect(wrapper.find('#field-title').element.value).toBe('旧'); // prefilled

    await wrapper.find('#field-title').setValue('新');
    await wrapper.find('[data-status="done"]').trigger('click');
    await wrapper.find('#task-form').trigger('submit');
    await flushPromises();

    expect(tasks.state.tasks.length).toBe(1); // updated in place, no new task
    expect(tasks.getTask(t.id).title).toBe('新');
    expect(tasks.getTask(t.id).status).toBe('done');
    expect(wrapper.find('#toast').text()).toContain('已保存'); // toast 已保存
    expect(backdrop().element.hidden).toBe(true); // modal closed
  });
});

describe('modal close paths', () => {
  it('Escape closes the modal (keyboard: Escape closes layers)', async () => {
    ui.openTaskModal(null);
    await flushPromises();
    expect(backdrop().element.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(backdrop().element.hidden).toBe(true); // Esc closes modal
  });

  it('backdrop click closes the modal', async () => {
    ui.openTaskModal(null);
    await flushPromises();
    await backdrop().trigger('click');
    await flushPromises();
    expect(backdrop().element.hidden).toBe(true);
  });

  it('cancel button calls ui.closeTaskModal via the exposed close', async () => {
    ui.openTaskModal(null);
    await flushPromises();
    await wrapper.find('#btn-cancel').trigger('click');
    await flushPromises();
    expect(ui.state.taskModalOpen).toBe(false);
    expect(backdrop().element.hidden).toBe(true);
  });
});

describe('keyboard: Shift+N opens create modal, N focuses quick add', () => {
  it('Shift+N on a non-typing target opens the create modal', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'N', shiftKey: true }));
    await flushPromises();
    expect(backdrop().element.hidden).toBe(false); // Shift+N opens modal
    expect(wrapper.find('#modal-title').text()).toBe('新建任务');
  });

  it('N focuses the quick-capture input', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    await flushPromises();
    expect(backdrop().element.hidden).toBe(true); // N does not open the modal
    expect(document.activeElement && document.activeElement.id).toBe('quick-title');
  });
});
