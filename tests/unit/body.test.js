/* Unit tests — 正文（body）块模型：normalizeBody 白名单/预算、notes 迁移、摘要与计数。 */
import { describe, it, expect } from 'vitest';
import {
  normalizeBody,
  bodyFromNotes,
  bodyText,
  bodySummary,
  countImages,
} from '../../src/core/body.js';
import { normalizeTask, createTaskData } from '../../src/core/tasks.js';
import { BODY_TEXT_MAX, IMAGES_MAX_PER_TASK, IMAGE_DATAURL_MAX } from '../../src/constants.js';

const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const WEBP = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

/** 指定长度的合法 data URL（base64 体按需填充）。 */
function dataUrl(len) {
  const prefix = 'data:image/png;base64,';
  const body = 'A'.repeat(Math.max(0, len - prefix.length));
  return prefix + body;
}

describe('normalizeBody', () => {
  it('non-array / empty input → []', () => {
    expect(normalizeBody(undefined)).toEqual([]);
    expect(normalizeBody(null)).toEqual([]);
    expect(normalizeBody('text')).toEqual([]);
    expect(normalizeBody({})).toEqual([]);
  });

  it('keeps paragraphs and images, drops unknown block types', () => {
    const body = normalizeBody([
      { type: 'p', text: '  第一段  ' },
      { type: 'img', src: WEBP, w: 100.4, h: 80 },
      { type: 'h1', text: '非法类型' },
      { type: 'p', text: '第二段' },
    ]);
    expect(body).toEqual([
      { type: 'p', text: '第一段' },
      { type: 'img', src: WEBP, w: 100, h: 80 },
      { type: 'p', text: '第二段' },
    ]);
  });

  it('drops empty / whitespace-only paragraphs and CRLF', () => {
    expect(normalizeBody([{ type: 'p', text: '   ' }, { type: 'p', text: 'a\r\nb' }])).toEqual([
      { type: 'p', text: 'a\nb' },
    ]);
  });

  it('rejects invalid / oversized / non-data-url img src', () => {
    expect(normalizeBody([{ type: 'img', src: 'https://evil.example/x.png' }])).toEqual([]);
    expect(normalizeBody([{ type: 'img', src: 'data:text/html;base64,AAAA' }])).toEqual([]);
    expect(normalizeBody([{ type: 'img', src: dataUrl(IMAGE_DATAURL_MAX + 1) }])).toEqual([]);
    expect(normalizeBody([{ type: 'img', src: dataUrl(IMAGE_DATAURL_MAX), w: '100' }])).toEqual([
      { type: 'img', src: dataUrl(IMAGE_DATAURL_MAX), w: null, h: null },
    ]);
  });

  it('caps images at IMAGES_MAX_PER_TASK, keeping the first N', () => {
    const raw = Array.from({ length: IMAGES_MAX_PER_TASK + 3 }, () => ({ type: 'img', src: WEBP }));
    const body = normalizeBody(raw);
    expect(body.length).toBe(IMAGES_MAX_PER_TASK);
    expect(countImages(body)).toBe(IMAGES_MAX_PER_TASK);
  });

  it('caps total text at BODY_TEXT_MAX by truncating in order', () => {
    const raw = [
      { type: 'p', text: 'a'.repeat(BODY_TEXT_MAX - 1) },
      { type: 'p', text: 'b'.repeat(50) },
    ];
    const body = normalizeBody(raw);
    // 预算按块文本长度计（不含 bodyText 拼接的换行符）
    const total = body.reduce((n, b) => n + b.text.length, 0);
    expect(total).toBe(BODY_TEXT_MAX);
    expect(body[1].text).toBe('b');
  });

  it('text after the budget is exhausted is dropped', () => {
    const body = normalizeBody([
      { type: 'p', text: 'a'.repeat(BODY_TEXT_MAX) },
      { type: 'p', text: '溢出段落' },
    ]);
    expect(body.length).toBe(1);
  });

  it('is immune to prototype pollution in blocks', () => {
    const payload = JSON.parse('{"type":"p","text":"ok","__proto__":{"polluted":1}}');
    const body = normalizeBody([payload, JSON.parse('{"type":"img","src":' + JSON.stringify(WEBP) + ',"constructor":{"prototype":{"x":1}}}')]);
    expect(body.length).toBe(2);
    expect(Object.getPrototypeOf(body[0])).toBe(Object.prototype);
    expect(body[0].polluted).toBe(undefined);
    expect(body[1].constructor).toBe(Object);
  });
});

describe('bodyFromNotes', () => {
  it('splits lines into paragraphs, drops empty lines', () => {
    expect(bodyFromNotes('第一行\n\n第二行')).toEqual([
      { type: 'p', text: '第一行' },
      { type: 'p', text: '第二行' },
    ]);
  });

  it('empty / non-string → []', () => {
    expect(bodyFromNotes('')).toEqual([]);
    expect(bodyFromNotes('  \n ')).toEqual([]);
    expect(bodyFromNotes(null)).toEqual([]);
    expect(bodyFromNotes(undefined)).toEqual([]);
  });

  it('enforces the same budgets as normalizeBody', () => {
    expect(bodyFromNotes('x'.repeat(BODY_TEXT_MAX + 10))[0].text.length).toBe(BODY_TEXT_MAX);
  });

  it('data-url strings in notes stay literal text paragraphs', () => {
    // 备注是纯文本：内容里出现的 data URL 按文字段落迁移，不会被当作图片
    expect(bodyFromNotes(GIF)).toEqual([{ type: 'p', text: GIF }]);
  });
});

describe('bodyText / bodySummary / countImages', () => {
  const body = normalizeBody([
    { type: 'p', text: '第一段' },
    { type: 'img', src: WEBP, w: 10, h: 10 },
    { type: 'p', text: '第二段' },
  ]);

  it('bodyText joins paragraphs', () => {
    expect(bodyText(body)).toBe('第一段\n第二段');
    expect(bodyText([])).toBe('');
    expect(bodyText(undefined)).toBe('');
  });

  it('bodySummary collapses whitespace and truncates with ellipsis', () => {
    expect(bodySummary(body)).toBe('第一段');
    const long = normalizeBody([{ type: 'p', text: 'x'.repeat(100) }]);
    const s = bodySummary(long, 10);
    expect(s.length).toBe(11);
    expect(s.endsWith('…')).toBe(true);
    expect(bodySummary([{ type: 'img', src: WEBP }])).toBe('');
    expect(bodySummary([])).toBe('');
  });

  it('countImages counts img blocks only', () => {
    expect(countImages(body)).toBe(1);
    expect(countImages([{ type: 'p', text: 'x' }])).toBe(0);
    expect(countImages(null)).toBe(0);
  });
});

describe('notes → body migration', () => {
  it('normalizeTask moves notes into the first paragraphs and clears notes', () => {
    const t = normalizeTask({
      id: '1',
      title: '旧任务',
      status: 'todo',
      priority: 'medium',
      notes: '  背景说明  \n第二行',
    });
    expect(t.notes).toBe('');
    expect(t.body).toEqual([
      { type: 'p', text: '背景说明' },
      { type: 'p', text: '第二行' },
    ]);
  });

  it('migration is idempotent and does not resurrect cleared bodies', () => {
    const first = normalizeTask({ id: '1', title: 't', status: 'todo', priority: 'medium', notes: 'n1' });
    const cleared = { ...first, body: [] };
    const second = normalizeTask(cleared);
    expect(second.notes).toBe(''); // 清空正文不会被旧 notes 复活
    expect(second.body).toEqual([]);
  });

  it('existing body wins; legacy notes field is cleared', () => {
    const t = normalizeTask({
      id: '1',
      title: 't',
      status: 'todo',
      priority: 'medium',
      notes: '旧备注',
      body: [{ type: 'p', text: '正文' }],
    });
    expect(t.body).toEqual([{ type: 'p', text: '正文' }]);
    expect(t.notes).toBe('');
  });

  it('createTaskData accepts body blocks directly', () => {
    const t = createTaskData(
      { title: 'x', body: [{ type: 'img', src: GIF, w: 1, h: 1 }] },
      { id: 'c1' }
    );
    expect(t.body).toEqual([{ type: 'img', src: GIF, w: 1, h: 1 }]);
    expect(t.notes).toBe('');
  });

  it('buildNextOccurrence deep-copies body blocks', async () => {
    const { buildNextOccurrence } = await import('../../src/core/tasks.js');
    const base = createTaskData(
      { title: 'r', repeat: 'daily', body: [{ type: 'p', text: '段' }] },
      { id: 'r1' }
    );
    const next = buildNextOccurrence(base, { id: 'r2' });
    expect(next.body).toEqual([{ type: 'p', text: '段' }]);
    expect(next.body[0]).not.toBe(base.body[0]);
  });
});
