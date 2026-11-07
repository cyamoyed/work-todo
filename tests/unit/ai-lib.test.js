/* Unit tests — AI title request: OpenAI-compatible fetch mapping, timeout, never-reject contract. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  generateTaskTitle,
  generateImageTitle,
  chatCompletionsUrl,
} from '../../src/lib/ai.js';
import { AI_TIMEOUT_MS } from '../../src/constants.js';

const CONFIG = { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'test-model' };

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function okCompletion(content) {
  return jsonResponse(200, { choices: [{ message: { role: 'assistant', content } }] });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('chatCompletionsUrl', () => {
  it('strips trailing slashes and appends the chat path', () => {
    expect(chatCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions'
    );
    expect(chatCompletionsUrl('https://api.example.com')).toBe(
      'https://api.example.com/chat/completions'
    );
  });
});

describe('generateTaskTitle', () => {
  it('posts an OpenAI-compatible chat completion and resolves the extracted title', async () => {
    const fetch = vi.fn(async () => okCompletion('整理季度复盘材料'));
    const res = await generateTaskTitle({ text: '季度复盘……', config: CONFIG, fetch });
    expect(res).toEqual({ ok: true, title: '整理季度复盘材料' });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('test-model');
    expect(body.stream).toBe(false);
    expect(body.messages[1].content).toBe('季度复盘……');
  });

  it('rejects missing config up front without calling fetch', async () => {
    const fetch = vi.fn();
    expect((await generateTaskTitle({ text: 'x', config: {}, fetch })).reason).toBe('config');
    expect(
      (await generateTaskTitle({ text: 'x', config: { baseUrl: 'u', apiKey: 'k' }, fetch })).reason
    ).toBe('config');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps 401/403 to auth and 429 to rate-limited', async () => {
    const auth = await generateTaskTitle({
      text: 'x',
      config: CONFIG,
      fetch: async () => jsonResponse(401, {}),
    });
    expect(auth).toEqual({ ok: false, reason: 'auth' });
    const limited = await generateTaskTitle({
      text: 'x',
      config: CONFIG,
      fetch: async () => jsonResponse(429, {}),
    });
    expect(limited).toEqual({ ok: false, reason: 'rate-limited' });
  });

  it('maps other non-ok statuses to http', async () => {
    const res = await generateTaskTitle({
      text: 'x',
      config: CONFIG,
      fetch: async () => jsonResponse(500, {}),
    });
    expect(res).toEqual({ ok: false, reason: 'http' });
  });

  it('maps network failures to network', async () => {
    const res = await generateTaskTitle({
      text: 'x',
      config: CONFIG,
      fetch: async () => {
        throw new Error('connection refused');
      },
    });
    expect(res).toEqual({ ok: false, reason: 'network' });
  });

  it('maps empty choices / blank content to empty', async () => {
    const noChoices = await generateTaskTitle({
      text: 'x',
      config: CONFIG,
      fetch: async () => jsonResponse(200, { choices: [] }),
    });
    expect(noChoices).toEqual({ ok: false, reason: 'empty' });
    const blank = await generateTaskTitle({
      text: 'x',
      config: CONFIG,
      fetch: async () => okCompletion('  '),
    });
    expect(blank).toEqual({ ok: false, reason: 'empty' });
  });

  it('aborts on timeout and reports network', async () => {
    const fetch = vi.fn(
      (url, opts) =>
        new Promise((resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const pending = generateTaskTitle({ text: 'x', config: CONFIG, fetch });
    await vi.advanceTimersByTimeAsync(AI_TIMEOUT_MS + 1);
    const res = await pending;
    expect(res).toEqual({ ok: false, reason: 'network' });
  });
});

describe('generateImageTitle', () => {
  const PNG = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

  it('posts a vision request (image_url message) and resolves the extracted title', async () => {
    const fetch = vi.fn(async () => okCompletion('整理季度复盘截图'));
    const res = await generateImageTitle({ dataUrl: PNG, config: CONFIG, fetch });
    expect(res).toEqual({ ok: true, title: '整理季度复盘截图' });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: expect.any(String) },
      { type: 'image_url', image_url: { url: PNG } },
    ]);
  });

  it('maps a text-only model rejection (400) to http', async () => {
    const res = await generateImageTitle({
      dataUrl: PNG,
      config: CONFIG,
      fetch: async () => jsonResponse(400, {}),
    });
    expect(res).toEqual({ ok: false, reason: 'http' });
  });

  it('missing config / invalid image resolves coded failure without fetch', async () => {
    const fetch = vi.fn();
    expect((await generateImageTitle({ dataUrl: PNG, config: {}, fetch })).reason).toBe('config');
    expect((await generateImageTitle({ dataUrl: 'nope', config: CONFIG, fetch })).reason).toBe(
      'empty'
    );
    expect((await generateImageTitle({ dataUrl: '', config: CONFIG, fetch })).reason).toBe('empty');
    expect(fetch).not.toHaveBeenCalled();
  });
});
