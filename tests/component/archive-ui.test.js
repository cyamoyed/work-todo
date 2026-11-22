/* Component tests — 归档功能：行内归档按钮（已完成任务）、批量归档/恢复、归档视图、侧栏计数。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';

let wrapper;
let router;
let tasks;
let ui;

beforeEach(async () => {
  resetState();
  ({ wrapper, router, tasks, ui } = await mountApp({ route: '/all' }));
  tasks.createTask({ title: '写周报', status: 'todo' });
  tasks.createTask({ title: '整理需求', status: 'todo' });
  await flushPromises();
});

afterEach(async () => {
  await cleanup();
});

const toast = () => wrapper.find('#toast');
const cards = () => wrapper.findAll('#task-list .task-card');
const rowArchiveButtons = () =>
  wrapper.findAll('.task-card [aria-label="归档任务"], .task-card [aria-label="取消归档"]');
const batchBarBtn = (label) =>
  wrapper.findAll('#batch-bar .btn').find((b) => b.text() === label);

describe('行内归档按钮（已完成任务一键归档）', () => {
  it('未完成行没有归档按钮，已完成行有（在「已完成」视图验证）', async () => {
    expect(rowArchiveButtons().length).toBe(0);

    const done = tasks.createTask({ title: '已完成的', status: 'done' });
    await flushPromises();
    await router.push('/done');
    await flushPromises();
    // 普通视图中已完成行折叠不可见，「已完成」视图直接列出
    expect(rowArchiveButtons().length).toBe(1);
    expect(tasks.getTask(done.id).archivedAt).toBe(null);
  });

  it('点击已完成行的归档按钮：移出列表、计数变化、可撤销', async () => {
    const done = tasks.createTask({ title: '已完成的', status: 'done' });
    await flushPromises();
    await router.push('/done');
    await flushPromises();

    await wrapper.find('[aria-label="归档任务"]').trigger('click');
    await flushPromises();

    expect(tasks.getTask(done.id).archivedAt).toBeTruthy();
    expect(tasks.getTask(done.id).shelvedAt).toBe(null);
    expect(wrapper.find('#nav-count-archive').text()).toBe('1');
    expect(wrapper.find('#nav-count-done').text()).toBe('0');
    expect(cards().length).toBe(0);
    expect(toast().text()).toContain('已归档');
    expect(toast().text()).toContain('撤销');

    await toast().find('button').trigger('click');
    await flushPromises();
    expect(tasks.getTask(done.id).archivedAt).toBe(null);
  });
});

describe('批量归档', () => {
  it('多选后点「归档」：移出列表并汇报数量，侧栏计数随之变化', async () => {
    expect(wrapper.find('#nav-count-all').text()).toBe('2');
    expect(wrapper.find('#nav-count-archive').text()).toBe('0');

    await cards()[0].find('.select-check').trigger('click');
    await flushPromises();
    expect(batchBarBtn('归档')).toBeTruthy();
    await batchBarBtn('归档').trigger('click');
    await flushPromises();

    expect(cards().length).toBe(1);
    expect(toast().text()).toContain('已归档 1 项');
    expect(tasks.state.tasks.filter((t) => t.archivedAt).length).toBe(1);
    expect(wrapper.find('#nav-count-archive').text()).toBe('1');
    expect(wrapper.find('#nav-count-all').text()).toBe('1');
  });

  it('在「搁置」视图批量归档搁置任务：脱离搁置进入归档', async () => {
    const id = cards()[0].attributes('data-id');
    tasks.shelveTask(id, true);
    await flushPromises();
    await router.push('/shelved');
    await flushPromises();
    expect(cards().length).toBe(1);

    await cards()[0].find('.select-check').trigger('click');
    await flushPromises();
    await batchBarBtn('归档').trigger('click');
    await flushPromises();

    expect(tasks.getTask(id).archivedAt).toBeTruthy();
    expect(tasks.getTask(id).shelvedAt).toBe(null);
    expect(wrapper.find('#nav-count-shelved').text()).toBe('0');
    expect(wrapper.find('#nav-count-archive').text()).toBe('1');
  });
});

describe('归档视图', () => {
  it('路由 /archive 只列归档任务，行内一键恢复', async () => {
    const done = tasks.createTask({ title: '已完成的', status: 'done' });
    tasks.archiveTask(done.id, true);
    await flushPromises();

    await router.push('/archive');
    await flushPromises();

    expect(ui.state.viewMode).toBe('archive');
    expect(wrapper.find('#list-title').text()).toBe('归档');
    expect(cards().length).toBe(1);
    expect(cards()[0].text()).toContain('已完成的');
    expect(cards()[0].text()).toContain('已归档');
    expect(cards()[0].classes()).toContain('is-archived');

    await cards()[0].find('[aria-label="取消归档"]').trigger('click');
    await flushPromises();

    expect(tasks.getTask(done.id).archivedAt).toBe(null);
    expect(cards().length).toBe(0);
  });

  it('归档视图里批量按钮变为「恢复」，恢复后回到原视图', async () => {
    const id = cards()[0].attributes('data-id');
    tasks.archiveTask(id, true);
    await flushPromises();

    await router.push('/archive');
    await flushPromises();
    // 归档视图不提供搁置按钮（已归档任务不属于搁置流转）
    expect(batchBarBtn('搁置')).toBeUndefined();

    await cards()[0].find('.select-check').trigger('click');
    await flushPromises();
    const resume = batchBarBtn('恢复');
    expect(resume).toBeTruthy();
    await resume.trigger('click');
    await flushPromises();

    expect(toast().text()).toContain('已恢复 1 项');
    expect(cards().length).toBe(0);
    expect(tasks.getTask(id).archivedAt).toBe(null);
  });

  it('没有归档任务时显示专属空态文案', async () => {
    await router.push('/archive');
    await flushPromises();
    const empty = wrapper.find('#task-list .empty-state');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('没有归档的任务');
    expect(empty.text()).toContain('归档');
  });
});
