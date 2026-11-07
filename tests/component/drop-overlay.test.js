/* Component tests — drop-to-create：外部拖入文字 / 图片的放置浮层与建任务链路。
 * 拖事件用可取消 Event + 手工 dataTransfer stub，不依赖 happy-dom 的 DragEvent 实现；
 * 压缩管线 mock（happy-dom 无 canvas）。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { todayString } from '../../src/core/dates.js';

vi.mock('../../src/lib/imageCompress.js', () => ({
  compressImage: vi.fn(),
}));
import { compressImage } from '../../src/lib/imageCompress.js';

const WEBP = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

let wrapper;
let tasks;
let ui;
let router;

beforeEach(async () => {
  vi.clearAllMocks();
  compressImage.mockResolvedValue({ src: WEBP, w: 640, h: 480 });
  resetState();
  ({ wrapper, tasks, ui, router } = await mountApp());
});

afterEach(async () => {
  await cleanup();
});

/** Synthetic drag event on window with a dataTransfer stub. */
function fireDrag(type, { types = [], text = '', files = [] } = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.dataTransfer = {
    types,
    files,
    getData: (t) => (t === 'text/plain' ? text : ''),
  };
  window.dispatchEvent(e);
  return e;
}

function imageFile(name = '截图.png') {
  return { name, type: 'image/png', size: 1024 };
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

  it('shown for file drags with the image subtitle', async () => {
    fireDrag('dragenter', { types: ['Files'] });
    await wrapper.vm.$nextTick();
    expect(overlay().element.hidden).toBe(false);
    expect(overlay().text()).toContain('图片将存入正文');
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
  it('multi-line drop → first line title, rest as body paragraphs, QuickAdd defaults + undo toast', async () => {
    const countBefore = tasks.state.tasks.length;
    fireDrag('dragenter', { types: ['text/plain'] });
    const e = fireDrag('drop', { types: ['text/plain'], text: '给客户发项目排期\n附上里程碑表格\n抄送老王' });
    await wrapper.vm.$nextTick();

    expect(tasks.state.tasks.length).toBe(countBefore + 1);
    const task = tasks.state.tasks[tasks.state.tasks.length - 1];
    expect(task.title).toBe('给客户发项目排期');
    expect(task.body).toEqual([
      { type: 'p', text: '附上里程碑表格' },
      { type: 'p', text: '抄送老王' },
    ]);
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

  it('image drop → task titled by filename, compressed data URL in body', async () => {
    const countBefore = tasks.state.tasks.length;
    fireDrag('drop', { types: ['Files'], files: [imageFile('排期截图.png')] });
    await wrapper.vm.$nextTick();
    // compressImage 是异步的，等微任务排空
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(compressImage).toHaveBeenCalledTimes(1);
    expect(tasks.state.tasks.length).toBe(countBefore + 1);
    const task = tasks.state.tasks[tasks.state.tasks.length - 1];
    expect(task.title).toBe('排期截图');
    expect(task.body).toEqual([{ type: 'img', src: WEBP, w: 640, h: 480 }]);
    expect(ui.state.toast.message).toBe('已存入今天');
  });

  it('mixed text + image drop → first line title, paragraphs then image block', async () => {
    fireDrag('drop', {
      types: ['text/plain', 'Files'],
      text: '给客户发项目排期\n附图在下面',
      files: [imageFile('shot.png')],
    });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    const task = tasks.state.tasks[tasks.state.tasks.length - 1];
    expect(task.title).toBe('给客户发项目排期');
    expect(task.body).toEqual([
      { type: 'p', text: '附图在下面' },
      { type: 'img', src: WEBP, w: 640, h: 480 },
    ]);
  });

  it('non-image file drop → no task, hint toast', async () => {
    const countBefore = tasks.state.tasks.length;
    fireDrag('drop', { types: ['Files'], files: [{ name: '说明.pdf', type: 'application/pdf', size: 1 }] });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(tasks.state.tasks.length).toBe(countBefore);
    expect(ui.state.toast.open).toBe(true);
    expect(ui.state.toast.message).toBe('仅支持拖入文字或图片');
  });

  it('stands down while the task modal is open (editor takes over the drop)', async () => {
    ui.openTaskModal(null, null);
    await wrapper.vm.$nextTick();
    const countBefore = tasks.state.tasks.length;

    fireDrag('dragenter', { types: ['Files'] });
    await wrapper.vm.$nextTick();
    expect(overlay().element.hidden).toBe(true); // 不显示建任务浮层

    fireDrag('drop', { types: ['Files'], files: [imageFile()] });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    expect(tasks.state.tasks.length).toBe(countBefore); // 不建新任务（图进编辑器）
  });

  it('image compression failure → no task when nothing else to create, error toast', async () => {
    compressImage.mockRejectedValue(new Error('图片过大，压缩后仍超过预算（200KB）'));
    const countBefore = tasks.state.tasks.length;
    fireDrag('drop', { types: ['Files'], files: [imageFile('big.png')] });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();

    expect(tasks.state.tasks.length).toBe(countBefore);
    expect(ui.state.toast.open).toBe(true);
    expect(ui.state.toast.message).toBe('图片过大，压缩后仍超过预算（200KB）');
  });

  it('empty text payload → hint toast, no task', async () => {
    const countBefore = tasks.state.tasks.length;
    fireDrag('drop', { types: ['text/plain'], text: '   ' });
    await wrapper.vm.$nextTick();

    expect(tasks.state.tasks.length).toBe(countBefore);
    expect(ui.state.toast.open).toBe(true);
    expect(ui.state.toast.message).toBe('仅支持拖入文字或图片');
  });
});
