/* Component tests — app shell: rendered-DOM existence checks deferred from the
 * HTML-source asserts of tests/unit-v03.test.js and tests/unit-features.test.js
 * (now mounted-DOM asserts), plus the renderOverview / overview-sub /
 * footer / strip copy sections of tests/dom-behavior.test.js. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { useUiStore } from '../../src/store/ui.js';

let wrapper;
let tasks;
let ui;
let router;

beforeEach(async () => {
  resetState();
  ({ wrapper, tasks, ui, router } = await mountApp());
});

afterEach(async () => {
  await cleanup();
});

describe('export/import HTML anchors present', () => {
  it('settings-page transfer controls exist in the mounted DOM', async () => {
    await router.push('/settings');
    await flushPromises();
    expect(wrapper.find('#btn-export').exists()).toBe(true); // has btn-export
    expect(wrapper.find('#btn-import').exists()).toBe(true); // has btn-import
    expect(wrapper.find('#import-file').exists()).toBe(true); // has import-file
    expect(wrapper.find('#import-file').attributes('type')).toBe('file');
  });
});

describe('mobile shell nodes', () => {
  it('#btn-mobile-menu, #mobile-drawer and #btn-settings-mobile exist', () => {
    expect(wrapper.find('#btn-mobile-menu').exists()).toBe(true); // has btn-mobile-menu
    expect(wrapper.find('#mobile-drawer').exists()).toBe(true); // has mobile-drawer
    expect(wrapper.find('#btn-settings-mobile').exists()).toBe(true); // drawer settings entry
    expect(wrapper.find('#btn-mobile-menu').attributes('aria-controls')).toBe('mobile-drawer');
    expect(wrapper.find('#mobile-drawer').element.hidden).toBe(true); // closed by default
  });

  it('menu button opens the drawer', async () => {
    await wrapper.find('#btn-mobile-menu').trigger('click');
    expect(wrapper.find('#mobile-drawer').element.hidden).toBe(false);
    expect(wrapper.find('#btn-mobile-menu').attributes('aria-expanded')).toBe('true');
    await wrapper.find('#btn-close-drawer').trigger('click');
    expect(wrapper.find('#mobile-drawer').element.hidden).toBe(true);
  });
});

describe('form / toolbar nodes present in mounted App', () => {
  it('#field-tags and #field-repeat exist in TaskFormModal', async () => {
    ui.openTaskModal(null);
    await flushPromises();
    expect(wrapper.find('#field-tags').exists()).toBe(true); // has field-tags
    expect(wrapper.find('#field-repeat').exists()).toBe(true); // has field-repeat
    expect(wrapper.find('#field-notes').exists()).toBe(true); // has field-notes
  });

  it('#quick-add-form, #sort-select, #field-due-time, #fab-new exist', () => {
    expect(wrapper.find('#quick-add-form').exists()).toBe(true); // has quick-add-form
    expect(wrapper.find('#range-filter').exists()).toBe(false); // range chips moved to left nav only
    expect(wrapper.find('#sort-select').exists()).toBe(true); // has sort-select
    expect(wrapper.find('#field-due-time').exists()).toBe(true); // has field-due-time
    expect(wrapper.find('#fab-new').exists()).toBe(true); // has fab-new
  });

  it('[data-view="review"] exists in SideNav', () => {
    expect(wrapper.find('[data-view="review"]').exists()).toBe(true); // has review nav
  });
});

describe('renderOverview stats after create', () => {
  beforeEach(async () => {
    tasks.createTask({ title: 'A', status: 'todo', priority: 'high', dueDate: null });
    tasks.createTask({ title: 'B', status: 'in-progress', priority: 'medium', dueDate: null });
    tasks.createTask({ title: 'C', status: 'done', priority: 'low', dueDate: null });
    tasks.createTask({
      title: 'D',
      status: 'todo',
      priority: 'high',
      dueDate: `${new Date().getFullYear() - 1}-01-01`,
    });
    await flushPromises();
  });

  it('stats spans reflect the today-scope computation', () => {
    // today-scope: doneToday + (in-progress | overdue | due-today)
    expect(wrapper.find('#stat-done').text()).toBe('1'); // stat-done (今日完成)
    expect(wrapper.find('#stat-total').text()).toBe('3'); // stat-total (今日相关)
    expect(wrapper.find('#stat-todo').text()).toBe('0'); // stat-todo (今日到期)
    expect(wrapper.find('#stat-active').text()).toBe('1'); // stat-active (进行中)
    expect(wrapper.find('#stat-overdue').text()).toBe('1'); // stat-overdue (已逾期)
    expect(wrapper.find('#stat-overdue').classes()).toContain('is-alert'); // overdue has is-alert
  });
});

describe('overview-sub copy by scenario', () => {
  it('all done → 全部完成', async () => {
    tasks.createTask({ title: 'x', status: 'done' });
    await flushPromises();
    expect(wrapper.find('#overview-sub').text()).toContain('全部完成');
  });

  it('overdue → 逾期 copy', async () => {
    tasks.createTask({ title: 'x', status: 'todo', dueDate: '2000-01-01' });
    await flushPromises();
    expect(wrapper.find('#overview-sub').text()).toContain('逾期');
  });

  it('in progress → 推进 copy', async () => {
    tasks.createTask({ title: 'x', status: 'in-progress' });
    await flushPromises();
    expect(wrapper.find('#overview-sub').text()).toContain('进行中');
  });
});

describe('footer / strip copy semantics', () => {
  beforeEach(async () => {
    tasks.createTask({ title: '待办一项', status: 'todo' });
    tasks.createTask({ title: '进行一项', status: 'in-progress' });
    tasks.createTask({ title: '做完一项', status: 'done' });
    await flushPromises();
  });

  it('footer #task-stats reads N 未完成 · N 已完成 · 逾期 N', () => {
    const footer = wrapper.find('#task-stats').text();
    expect(footer).toContain('未完成'); // footer uses 未完成 not 进行中 for open count
    expect(footer).toContain('2 未完成'); // footer counts open as 2 未完成
    expect(footer).toContain('1 已完成'); // footer counts done
    expect(footer).toBe('2 未完成 · 1 已完成 · 逾期 0');
  });

  it('strip stat chips: 待推进 / 今日到期 / 逾期 / 进行中', () => {
    const strip = wrapper.find('#strip');
    const chips = strip.findAll('.stat-chip');
    expect(chips.length).toBe(4);
    expect(chips[0].text()).toBe('待推进 0');
    expect(strip.text()).toContain('今日到期 0');
    expect(strip.text()).toContain('逾期 0');
    expect(strip.text()).toContain('进行中 1');
  });

  it('strip flags 逾期 with the alert class when an overdue task exists', async () => {
    tasks.createTask({ title: '过期', status: 'todo', dueDate: '2000-01-01' });
    await flushPromises();
    const overdueChip = wrapper.find('#strip .stat-chip.alert');
    expect(overdueChip.exists()).toBe(true);
    expect(overdueChip.text()).toBe('逾期 1');
    // 待推进 counts isDueTodayOpen || isOverdue → just the overdue one (others have no due date)
    expect(wrapper.find('#strip .stat-chip').text()).toBe('待推进 1');
  });
});
