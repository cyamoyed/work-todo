/* Component tests — 正文富文本编辑器（contenteditable 连续输入面）：
 * 块模型水合/序列化、粘贴与拖入插图、预算、lightbox、卡片摘要展示。
 * 压缩管线 mock（happy-dom 无 canvas）；光标插入路径由 e2e/真机覆盖。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, resetState, cleanup } from './helpers/mountApp.js';

vi.mock('../../src/lib/imageCompress.js', () => ({
  compressImage: vi.fn(),
}));
import { compressImage } from '../../src/lib/imageCompress.js';

const WEBP = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

let wrapper;
let tasks;
let ui;

beforeEach(async () => {
  vi.clearAllMocks();
  compressImage.mockResolvedValue({ src: WEBP, w: 640, h: 480 });
  resetState();
  ({ wrapper, tasks, ui } = await mountApp());
});

afterEach(async () => {
  await cleanup();
});

async function openModal() {
  await wrapper.find('#btn-new').trigger('click');
  await flushPromises();
}

function richEl() {
  return wrapper.find('#field-notes').element;
}

function file(name = '截图.png') {
  return new File(['x'], name, { type: 'image/png' });
}

function setFiles(name) {
  const input = wrapper.find('#file-image').element;
  Object.defineProperty(input, 'files', {
    value: [file(name)],
    configurable: true,
  });
}

function fireDrop({ types = ['Files'], files = [], text = '' } = {}) {
  const e = new Event('drop', { bubbles: true, cancelable: true });
  e.dataTransfer = { types, files, getData: (t) => (t === 'text/plain' ? text : '') };
  window.dispatchEvent(e);
  return e;
}

async function saveAndFind(title) {
  await wrapper.find('#field-title').setValue(title);
  await wrapper.find('#task-form button[type="submit"]').trigger('submit');
  await flushPromises();
  return tasks.state.tasks.find((t) => t.title === title);
}

describe('rich editor surface', () => {
  it('renders one contenteditable surface keeping the #field-notes hook', async () => {
    await openModal();
    const rich = wrapper.find('#field-notes');
    expect(rich.exists()).toBe(true);
    expect(rich.attributes('contenteditable')).toBe('true');
    expect(rich.attributes('data-placeholder')).toContain('补充背景');
  });

  it('hydrates blocks of the edited task (text + inline image)', async () => {
    const t = tasks.createTask({
      title: '图文任务',
      body: [
        { type: 'p', text: '第一段' },
        { type: 'img', src: WEBP, w: 10, h: 10 },
        { type: 'p', text: '第二段' },
      ],
    });
    ui.openTaskModal(t.id);
    await flushPromises();

    expect(richEl().querySelectorAll('p').length).toBe(2);
    expect(richEl().querySelectorAll('img').length).toBe(1);
    expect(richEl().querySelectorAll('img')[0].src).toBe(WEBP);
  });

  it('typed text serializes back to body blocks on save', async () => {
    await openModal();
    richEl().textContent = '手动输入的正文';
    richEl().dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();

    const task = await saveAndFind('富文本任务');
    expect(task.body).toEqual([{ type: 'p', text: '手动输入的正文' }]);
  });

  it('foreign rich markup is cleaned by the whitelist serializer (no v-html anywhere)', async () => {
    await openModal();
    richEl().innerHTML = '<div>纯<b>文本</b>内容</div><img src="https://evil.example/x.png"><p>第二段</p>';
    richEl().dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();

    const task = await saveAndFind('清洗验证');
    expect(task.body).toEqual([
      { type: 'p', text: '纯文本内容' },
      { type: 'p', text: '第二段' },
    ]);
  });
});

describe('images in the rich editor', () => {
  it('file-picker image inserts inline and serializes to an img block', async () => {
    await openModal();
    setFiles();
    await wrapper.find('#file-image').trigger('change');
    await flushPromises();

    expect(richEl().querySelectorAll('img').length).toBe(1);
    expect(wrapper.text()).toContain('1/9 图');
    const task = await saveAndFind('带图任务');
    expect(task.body).toEqual([{ type: 'img', src: WEBP, w: 640, h: 480 }]);
  });

  it('pasted screenshot inserts inline and consumes the paste event', async () => {
    await openModal();
    const e = new Event('paste', { bubbles: true, cancelable: true });
    e.clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file() }] };
    richEl().dispatchEvent(e);
    await flushPromises();

    expect(e.defaultPrevented).toBe(true);
    expect(richEl().querySelectorAll('img').length).toBe(1);
  });

  it('window drop while modal open inserts text and image into the editor', async () => {
    await openModal();
    fireDrop({ types: ['text/plain', 'Files'], text: '拖进来的文字', files: [file()] });
    await flushPromises();

    expect(richEl().querySelectorAll('img').length).toBe(1);
    expect(richEl().textContent).toContain('拖进来的文字');
    // 不建新任务
    expect(tasks.state.tasks.filter((t) => !t.deletedAt).length).toBe(0);
  });

  it('image drop appends and leaves an empty paragraph line to continue typing', async () => {
    await openModal();
    fireDrop({ files: [file()] });
    await flushPromises();

    const el = richEl();
    expect(el.querySelectorAll('img').length).toBe(1);
    expect(el.lastElementChild.tagName).toBe('P');
  });

  it('budget: the 10th image is rejected with the inline error', async () => {
    await openModal();
    for (let i = 0; i < 9; i++) {
      setFiles(`a${i}.png`);
      await wrapper.find('#file-image').trigger('change');
      await flushPromises();
    }
    expect(richEl().querySelectorAll('img').length).toBe(9);
    expect(wrapper.find('.body-error').element.hidden).toBe(true);

    setFiles('a10.png');
    await wrapper.find('#file-image').trigger('change');
    await flushPromises();
    expect(richEl().querySelectorAll('img').length).toBe(9);
    expect(wrapper.find('.body-error').element.hidden).toBe(false);
    expect(wrapper.find('.body-error').text()).toContain('最多 9 张图片');
  });

  it('compression failure surfaces the reason inline', async () => {
    compressImage.mockRejectedValue(new Error('GIF 图片超过大小限制（200KB）'));
    await openModal();
    setFiles('动图.gif');
    await wrapper.find('#file-image').trigger('change');
    await flushPromises();

    expect(wrapper.find('.body-error').text()).toBe('GIF 图片超过大小限制（200KB）');
    expect(richEl().querySelectorAll('img').length).toBe(0);
  });

  it('clicking an inline image opens the lightbox; clicking it closes', async () => {
    await openModal();
    setFiles();
    await wrapper.find('#file-image').trigger('change');
    await flushPromises();

    expect(wrapper.find('.lightbox').exists()).toBe(false);
    await wrapper.find('#field-notes img').trigger('click');
    expect(wrapper.find('.lightbox').exists()).toBe(true);
    await wrapper.find('.lightbox').trigger('click');
    expect(wrapper.find('.lightbox').exists()).toBe(false);
  });
});

describe('card display: summary + image count', () => {
  it('shows first-paragraph summary and N 图 chip', async () => {
    tasks.createTask({
      title: '图文任务',
      body: [
        { type: 'p', text: '正文首段内容' },
        { type: 'img', src: WEBP, w: 10, h: 10 },
        { type: 'img', src: WEBP, w: 10, h: 10 },
      ],
    });
    await flushPromises();

    const notes = wrapper.find('.task-notes');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toContain('正文首段内容');
    expect(notes.text()).toContain('2 图');
    expect(notes.findAll('.task-imgcount').length).toBe(1);
  });

  it('task without body renders no notes line', async () => {
    tasks.createTask({ title: '纯标题任务' });
    await flushPromises();
    expect(wrapper.find('.task-notes').exists()).toBe(false);
  });
});
