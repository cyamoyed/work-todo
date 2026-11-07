/* work-todo — AI 标题请求（OpenAI 兼容 chat/completions，raw fetch，无 Vue）
 *
 * 文字与图片（vision）共用同一条请求管线：永不 reject，返回 { ok, title |
 * reason }，机读 reason 由调用层映射成中文文案。密钥只随单次请求发出，不落
 * 日志。共用「模型」字段——纯文字模型收到 image_url 会以 4xx 拒绝，调用方
 * 按失败回退文件名标题。
 */

import { AI_TIMEOUT_MS } from '../constants.js';
import { buildTitleMessages, buildVisionTitleMessages, extractTitle } from '../core/ai.js';

/** Wrap a fetch with an abort timer（同 lib/update.js fetchWithTimeout）。 */
async function fetchWithTimeout(fetchImpl, url, opts = {}) {
  if (typeof AbortController !== 'function') return fetchImpl(url, opts);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), AI_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** 'https://api.example.com/v1/' → 'https://api.example.com/v1/chat/completions'。 */
export function chatCompletionsUrl(baseUrl) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
}

/**
 * 共用管线：POST /chat/completions → 状态映射 → 提取标题。
 * Resolves to { ok: true, title } | { ok: false, reason } —
 * reason: 'config' | 'network' | 'auth' | 'rate-limited' | 'http' | 'empty'。
 */
async function chatCompletion({ config, messages, fetch: fetchImpl }) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const base = config || {};
  if (!doFetch || !base.baseUrl || !base.apiKey || !base.model) {
    return { ok: false, reason: 'config' };
  }
  if (!messages) return { ok: false, reason: 'empty' };

  let res = null;
  try {
    res = await fetchWithTimeout(doFetch, chatCompletionsUrl(base.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${base.apiKey}`,
      },
      body: JSON.stringify({
        model: base.model,
        messages,
        temperature: 0.2,
        max_tokens: 500,
        stream: false,
      }),
    });
  } catch (_) {
    return { ok: false, reason: 'network' };
  }
  if (res && (res.status === 401 || res.status === 403)) return { ok: false, reason: 'auth' };
  if (res && res.status === 429) return { ok: false, reason: 'rate-limited' };
  if (!res || !res.ok) return { ok: false, reason: 'http' };

  try {
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    const title = extractTitle(content);
    if (!title) return { ok: false, reason: 'empty' };
    return { ok: true, title };
  } catch (_) {
    return { ok: false, reason: 'empty' };
  }
}

/** 拖入文字 → AI 拟标题。 */
export async function generateTaskTitle({ text, config, fetch: fetchImpl } = {}) {
  return chatCompletion({ config, messages: buildTitleMessages(text), fetch: fetchImpl });
}

/** 压缩后的图片 data URL → AI 识别内容拟标题（vision 格式）。 */
export async function generateImageTitle({ dataUrl, config, fetch: fetchImpl } = {}) {
  return chatCompletion({ config, messages: buildVisionTitleMessages(dataUrl), fetch: fetchImpl });
}
