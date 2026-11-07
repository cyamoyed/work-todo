/* work-todo — AI 标题识别的纯逻辑：提示词构建 + 返回清洗（no fetch / no DOM / no Vue） */

import { AI_TEXT_MAX, TITLE_MAX } from '../constants.js';

const SYSTEM_PROMPT = [
  '你是待办应用的标题助手。根据用户提供的原始文字，拟一个待办任务标题：',
  '- 动词或动宾开头，说清要做什么',
  '- 不超过 20 个汉字',
  '- 只输出标题本身，不要引号、句尾标点或任何解释',
].join('\n');

const VISION_PROMPT = [
  '你是待办应用的标题助手。识别图片内容，拟一个待办任务标题：',
  '- 动词或动宾开头，说清要做什么；截图、聊天记录、票据则提炼其中要做的事',
  '- 不超过 20 个汉字',
  '- 只输出标题本身，不要引号、句尾标点或任何解释',
].join('\n');

/**
 * 拖入原文 → OpenAI chat messages。原文截断到 AI_TEXT_MAX（标题不需要全文，
 * 完整原文由调用方直接存入正文）。无有效文字返回 null（调用方跳过 AI）。
 */
export function buildTitleMessages(rawText) {
  const text = String(rawText == null ? '' : rawText).trim();
  if (!text) return null;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: text.slice(0, AI_TEXT_MAX) },
  ];
}

/**
 * 压缩后的图片 data URL → OpenAI vision messages（image_url 数组格式）。
 * 非 base64 图片 data URL 返回 null（调用方跳过识别）。
 */
export function buildVisionTitleMessages(dataUrl) {
  const url = typeof dataUrl === 'string' ? dataUrl.trim() : '';
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) return null;
  return [
    { role: 'system', content: VISION_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: '请根据图片内容拟一个待办任务标题' },
        { type: 'image_url', image_url: { url } },
      ],
    },
  ];
}

/** 首个非空行（AI 可能输出多行/前导空行）。 */
function firstLine(text) {
  for (const line of String(text).split(/\r?\n/)) {
    const s = line.trim();
    if (s) return s;
  }
  return '';
}

/**
 * 清洗 AI 返回：trim、剥首尾包裹引号、取首个非空行、TITLE_MAX 截断。
 * 空返回 ''（调用方按提取失败处理）。
 */
export function extractTitle(content) {
  let s = firstLine(content);
  s = s.replace(/^["'“”「」『』]+/, '').replace(/["'“”「」『』]+$/, '').trim();
  if (!s) return '';
  return s.slice(0, TITLE_MAX);
}

/**
 * 同步载荷里的 AI 配置 blob 白名单校验（同 normalizeTask 手法，防原型污染）。
 * 内容字段允许为空串（清空配置也是合法状态，靠 updatedAt 传播）；
 * updatedAt 缺失或类型不对视为无效载荷，返回 null（调用方忽略）。
 */
export function normalizeAiPayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.enabled !== 'boolean') return null;
  if (typeof raw.baseUrl !== 'string' || typeof raw.apiKey !== 'string' || typeof raw.model !== 'string') {
    return null;
  }
  if (typeof raw.updatedAt !== 'string' || !raw.updatedAt) return null;
  return {
    enabled: raw.enabled,
    baseUrl: raw.baseUrl,
    apiKey: raw.apiKey,
    model: raw.model,
    updatedAt: raw.updatedAt,
  };
}
