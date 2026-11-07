/* Component tests — drop-to-create：外部拖入文字的放置浮层与建任务链路。
 * 拖事件用可取消 Event + 手工 dataTransfer stub，不依赖 happy-dom 的 DragEvent 实现。 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { todayString } from '../../src/core/dates.js';

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

/** Synthetic drag event on window with a dataTransfer stub. */
function fireDrag(type, { types = [], text = '' } = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.dataTransfer = {
    types,
    getData: (t) => (t === 'text/plain' ? text : ''),
  };
  window.dispatchEvent(e);
  return e;
}

const overlay = () => wrapper.find('#drop-overlay');

describe('drop overlay visibility', () => {
  it('hidden until a text drag enters, shown on dragenter, hidden again on leave', async () => {
    expect(overlay().element.hidden).toBe(true);

    fireDrag('dragenter', { types: ['text/plain'] });
    await wrapper.vm.$nextTick();
    expect(overlay().element.hidden).toBe(false);

    fireDrag('dragleave');
    await wrapper.vm.$nextTick();
    expect(overlay().element.hidden).toBe(true);
  });

  it('not shown for file-only drags', async () => {
    fireDrag('dragenter', { types: ['Files'] });
    await wrapper.vm.$nextTick();
    expect(overlay().element.hidden).toBe(true);
  });

  it('internal drags (dragstart from the app itself) never show the overlay', async () => {
    document.dispatchEvent(new Event('dragstart'));
    fireDrag('dragenter', { types: ['text/plain'] });
    await wrapper.vm.$nextTick();
    expect(overlay().element.hidden).toBe(true);
    document.dispatchEvent(new Event('dragend'));
  });
});

describe('drop creates a task', () => {
  it('multi-line drop → first line title, rest notes, QuickAdd defaults + undo toast', async () => {
    const countBefore = tasks.state.tasks.length;
    fireDrag('dragenter', { types: ['text/plain'] });
    const e = fireDrag('drop', { types: ['text/plain'], text: '给客户发项目排期\n附上里程碑表格\n抄送老王' });
    await wrapper.vm.$nextTick();

    expect(tasks.state.tasks.length).toBe(countBefore + 1);
    const task = tasks.state.tasks[tasks.state.tasks.length - 1];
    expect(task.title).toBe('给客户发项目排期');
    expect(task.notes).toBe('附上里程碑表格\n抄送老王');
    expect(task.dueDate).toBe(todayString());
    expect(task.dueTime).toBe(null);
    expect(task.priority).toBe('medium');
    expect(task.status).toBe('todo');
    expect(task.projectId).toBe(null);

    // 浮层收起；toast 带「撤销」，执行即软删除
    expect(overlay().element.hidden).toBe(true);
    expect(ui.state.toast.open).toBe(true);
    expect(ui.state.toast.message).toBe('已存入今天');
    expect(ui.state.toast.actionLabel).toBe('撤销');
    ui.state.toast.action();
    expect(tasks.getTask(task.id)).toBe(null);
    expect(tasks.state.deletedTasks.some((t) => t.id === task.id)).toBe(true);

    // preventDefault 已拦下默认行为（WebView2 文件导航兜底同一通路）
    expect(e.defaultPrevented).toBe(true);
  });

  it('drop lands in the current project view', async () => {
    const project = tasks.createProject({ name: '官网改版' });
    await router.push(`/project/${project.id}`);
    await wrapper.vm.$nextTick();

    fireDrag('drop', { types: ['text/plain'], text: '整理菜单文案' });
    await wrapper.vm.$nextTick();

    const task = tasks.state.tasks[tasks.state.tasks.length - 1];
    expect(task.projectId).toBe(project.id);
  });

  it('file-only drop → no task, hint toast', async () => {
    const countBefore = tasks.state.tasks.length;
    fireDrag('drop', { types: ['Files'] });
    await wrapper.vm.$nextTick();

    expect(tasks.state.tasks.length).toBe(countBefore);
    expect(ui.state.toast.open).toBe(true);
    expect(ui.state.toast.message).toBe('仅支持拖入文字');
  });

  it('empty text payload → silent no-op', async () => {
    const countBefore = tasks.state.tasks.length;
    fireDrag('drop', { types: ['text/plain'], text: '   ' });
    await wrapper.vm.$nextTick();

    expect(tasks.state.tasks.length).toBe(countBefore);
    expect(ui.state.toast.open).toBe(false);
  });
});
