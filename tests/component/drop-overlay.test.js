/* Component tests — drop-to-create：外部拖入文字 / 图片的放置浮层与建任务链路。
 * 拖事件用可取消 Event + 手工 dataTransfer stub，不依赖 happy-dom 的 DragEvent 实现；
 * 压缩管线 mock（happy-dom 无 canvas）；AI 标题请求 mock（不触网）。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';
import { todayString } from '../../src/core/dates.js';
import { useAiStore } from '../../src/store/ai.js';

vi.mock('../../src/lib/imageCompress.js', () => ({
  compressImage: vi.fn(),
}));
import { compressImage } from '../../src/lib/imageCompress.js';

vi.mock('../../src/lib/ai.js', () => ({
  generateTaskTitle: vi.fn(),
  generateImageTitle: vi.fn(),
}));
import { generateTaskTitle, generateImageTitle } from '../../src/lib/ai.js';

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

/** 手动决空的 Promise（AI 请求在飞行中时先断言任务已建，再放行结果）。 */
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** 开启并配置 AI（store 直接写；mount 时 DropOverlay.init 从 localStorage 读回一致）。 */
function enableAi() {
  useAiStore().configure({ enabled: true, baseUrl: 'https://ai.test/v1', apiKey: 'sk', model: 'm' });
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await wrapper.vm.$nextTick();
}

/** Synthetic paste event with a clipboardData stub, dispatched on `target`
 *  (bubbles up to the window listener; target reports the dispatch origin). */
function firePaste({ files = [], text = '', target = document.body } = {}) {
  const e = new Event('paste', { bubbles: true, cancelable: true });
  e.clipboardData = {
    items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    files,
    getData: (t) => (t === 'text/plain' ? text : ''),
  };
  target.dispatchEvent(e);
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

  it('AI unconfigured (default-on but no service config) → heuristic stands, no AI request', async () => {
    fireDrag('drop', { types: ['text/plain'], text: '整理会议纪要\n补充行动项' });
    await flush();

    expect(generateTaskTitle).not.toHaveBeenCalled();
    const task = tasks.state.tasks[tasks.state.tasks.length - 1];
    expect(task.title).toBe('整理会议纪要');
    expect(ui.state.toast.message).toBe('已存入今天');
  });
});

describe('AI title enhancement (enabled)', () => {
  // 外层 beforeEach 已挂载 App；store 是模块级单例，这里开启后 isReady 立即生效，
  // 无需重新挂载（避免双实例重复监听 window 拖拽）。
  beforeEach(() => {
    enableAi();
  });

  it('overlay subtitle announces AI titling while ready', async () => {
    fireDrag('dragenter', { types: ['text/plain'] });
    await wrapper.vm.$nextTick();
    expect(overlay().text()).toContain('AI 生成标题，原文进正文');
  });

  it('task is created immediately with the heuristic title, then AI replaces title and body gets the full text', async () => {
    const pending = deferred();
    generateTaskTitle.mockReturnValue(pending.promise);

    fireDrag('drop', { types: ['text/plain'], text: '给客户发项目排期\n附上里程碑表格' });
    await wrapper.vm.$nextTick();

    // 先建任务：首行兜底标题，toast 报告 AI 进行中，撤销可用
    expect(tasks.state.tasks.length).toBe(1);
    const task = tasks.state.tasks[0];
    expect(task.title).toBe('给客户发项目排期');
    expect(task.body).toEqual([{ type: 'p', text: '附上里程碑表格' }]);
    expect(ui.state.toast.message).toBe('已存入今天 · AI 生成标题中');
    expect(ui.state.toast.actionLabel).toBe('撤销');
    expect(generateTaskTitle).toHaveBeenCalledWith(
      expect.objectContaining({ text: '给客户发项目排期\n附上里程碑表格' })
    );

    pending.resolve({ ok: true, title: '发送项目排期给客户' });
    await flush();

    // updateTask 替换数组元素，断言前重新取最新对象
    const fresh = tasks.getTask(task.id);
    expect(fresh.title).toBe('发送项目排期给客户');
    // 完整原文进正文（首行也在）
    expect(fresh.body).toEqual([
      { type: 'p', text: '给客户发项目排期' },
      { type: 'p', text: '附上里程碑表格' },
    ]);
    expect(ui.state.toast.message).toBe('已存入今天 · 标题已生成');
    // 撤销仍可用
    ui.state.toast.action();
    expect(tasks.getTask(task.id)).toBe(null);
  });

  it('AI failure keeps the heuristic result and says so (undo intact)', async () => {
    const pending = deferred();
    generateTaskTitle.mockReturnValue(pending.promise);

    fireDrag('drop', { types: ['text/plain'], text: '给客户发项目排期\n附上里程碑表格' });
    await wrapper.vm.$nextTick();
    const task = tasks.state.tasks[0];

    pending.resolve({ ok: false, reason: 'network' });
    await flush();

    expect(task.title).toBe('给客户发项目排期');
    expect(task.body).toEqual([{ type: 'p', text: '附上里程碑表格' }]);
    expect(ui.state.toast.message).toBe('已存入今天 · AI 标题生成失败，已用首行做标题');
    expect(ui.state.toast.actionLabel).toBe('撤销');
  });

  it('undo before the AI settles → resolution does not revive the task', async () => {
    const pending = deferred();
    generateTaskTitle.mockReturnValue(pending.promise);

    fireDrag('drop', { types: ['text/plain'], text: '整理会议纪要' });
    await wrapper.vm.$nextTick();
    const task = tasks.state.tasks[0];
    ui.state.toast.action(); // 撤销（软删除）
    expect(tasks.getTask(task.id)).toBe(null);

    pending.resolve({ ok: true, title: '晚到的标题' });
    await flush();

    expect(tasks.getTask(task.id)).toBe(null);
    expect(tasks.state.tasks.some((t) => t.title === '晚到的标题')).toBe(false);
    expect(tasks.state.deletedTasks.some((t) => t.id === task.id)).toBe(true);
  });

  it('user edited the task while the AI was in flight → AI result is dropped', async () => {
    const pending = deferred();
    generateTaskTitle.mockReturnValue(pending.promise);

    fireDrag('drop', { types: ['text/plain'], text: '给客户发项目排期' });
    await wrapper.vm.$nextTick();
    const task = tasks.state.tasks[0];
    tasks.updateTask(task.id, { title: '我改过的标题', body: [{ type: 'p', text: '手写备注' }] });

    pending.resolve({ ok: true, title: 'AI 标题' });
    await flush();

    const fresh = tasks.getTask(task.id);
    expect(fresh.title).toBe('我改过的标题');
    expect(fresh.body).toEqual([{ type: 'p', text: '手写备注' }]);
  });

  it('image drop → AI vision replaces the filename title, toast sequence intact', async () => {
    const pending = deferred();
    generateImageTitle.mockReturnValue(pending.promise);

    fireDrag('drop', { types: ['Files'], files: [imageFile('排期截图.png')] });
    await flush();

    expect(tasks.state.tasks.length).toBe(1);
    const task = tasks.state.tasks[0];
    expect(task.title).toBe('排期截图'); // 先建任务（文件名兜底）
    expect(ui.state.toast.message).toBe('已存入今天 · AI 识别图片中');
    expect(generateImageTitle).toHaveBeenCalledWith(
      expect.objectContaining({ dataUrl: WEBP })
    );

    pending.resolve({ ok: true, title: '整理季度复盘截图' });
    await flush();

    expect(tasks.getTask(task.id).title).toBe('整理季度复盘截图');
    expect(tasks.getTask(task.id).body).toEqual([{ type: 'img', src: WEBP, w: 640, h: 480 }]);
    expect(ui.state.toast.message).toBe('已存入今天 · 标题已生成');
  });

  it('image drop AI failure keeps the filename title and says so', async () => {
    const pending = deferred();
    generateImageTitle.mockReturnValue(pending.promise);

    fireDrag('drop', { types: ['Files'], files: [imageFile('排期截图.png')] });
    await flush();
    const task = tasks.state.tasks[0];

    pending.resolve({ ok: false, reason: 'http' }); // 纯文字模型拒绝视觉请求
    await flush();

    expect(tasks.getTask(task.id).title).toBe('排期截图');
    expect(ui.state.toast.message).toBe('已存入今天 · AI 图片识别失败，已用文件名做标题');
    expect(ui.state.toast.actionLabel).toBe('撤销');
  });

  it('mixed text + image drop → text AI only, no vision call', async () => {
    generateTaskTitle.mockResolvedValue({ ok: true, title: 'AI 标题' });
    fireDrag('drop', {
      types: ['text/plain', 'Files'],
      text: '给客户发项目排期',
      files: [imageFile('shot.png')],
    });
    await flush();

    expect(generateTaskTitle).toHaveBeenCalled();
    expect(generateImageTitle).not.toHaveBeenCalled();
    expect(tasks.getTask(tasks.state.tasks[0].id).title).toBe('AI 标题');
  });
});

describe('paste image to create', () => {
  it('pasting an image creates a task with filename title, toast + undo', async () => {
    const countBefore = tasks.state.tasks.length;
    const e = firePaste({ files: [imageFile('排期截图.png')] });
    await flush();

    expect(tasks.state.tasks.length).toBe(countBefore + 1);
    const task = tasks.state.tasks[tasks.state.tasks.length - 1];
    expect(task.title).toBe('排期截图');
    expect(task.body).toEqual([{ type: 'img', src: WEBP, w: 640, h: 480 }]);
    expect(ui.state.toast.message).toBe('已存入今天');
    expect(ui.state.toast.actionLabel).toBe('撤销');
    expect(e.defaultPrevented).toBe(true);
  });

  it('text-only clipboard is left to native paste', () => {
    const countBefore = tasks.state.tasks.length;
    const e = firePaste({ text: '普通文字' });
    expect(tasks.state.tasks.length).toBe(countBefore);
    expect(e.defaultPrevented).toBe(false);
  });

  it('typing target with text+image clipboard → native paste wins', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const countBefore = tasks.state.tasks.length;
    const e = firePaste({ files: [imageFile()], text: '说明文字', target: input });
    input.remove();
    expect(tasks.state.tasks.length).toBe(countBefore);
    expect(e.defaultPrevented).toBe(false);
  });

  it('image-only clipboard while typing → still captured (input cannot hold images)', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const countBefore = tasks.state.tasks.length;
    firePaste({ files: [imageFile('截图.png')], target: input });
    input.remove();
    await flush();
    expect(tasks.state.tasks.length).toBe(countBefore + 1);
  });

  it('stands down while the task modal is open (editor owns paste)', async () => {
    ui.openTaskModal(null, null);
    await wrapper.vm.$nextTick();
    const countBefore = tasks.state.tasks.length;

    firePaste({ files: [imageFile()] });
    await flush();
    expect(tasks.state.tasks.length).toBe(countBefore);
  });

  it('paste + AI ready → vision title replaces the filename', async () => {
    enableAi();
    generateImageTitle.mockResolvedValue({ ok: true, title: '识别出的标题' });

    firePaste({ files: [imageFile('截图.png')] });
    await flush();

    const task = tasks.state.tasks[tasks.state.tasks.length - 1];
    expect(tasks.getTask(task.id).title).toBe('识别出的标题');
    expect(ui.state.toast.message).toBe('已存入今天 · 标题已生成');
  });
});
