/* work-todo — 正文（body）块模型：纯逻辑，无 DOM / 无 Vue
 *
 * 正文 = 结构化块数组（段落 + 图片），不用 HTML / Markdown 字符串：
 * 渲染走 Vue 组件映射（永不拼 HTML，保持全应用零 v-html 的安全姿势），
 * 搜索与摘要取块文本。图片以压缩后的 data URL 内嵌在块里——自包含 JSON
 * 的不变量保持成立：持久化 / 桌面镜像 / 备份 / 导出 / 同步零改动继承。
 */

import {
  BODY_TEXT_MAX,
  IMAGES_MAX_PER_TASK,
  IMAGE_DATAURL_MAX,
} from '../constants.js';

const IMG_SRC_RE = /^data:image\/(webp|jpeg|png|gif);base64,/;

function normalizeImgBlock(raw) {
  const src = raw.src;
  if (typeof src !== 'string' || src.length > IMAGE_DATAURL_MAX || !IMG_SRC_RE.test(src)) return null;
  return {
    type: 'img',
    src,
    w: Number.isFinite(raw.w) && raw.w > 0 ? Math.round(raw.w) : null,
    h: Number.isFinite(raw.h) && raw.h > 0 ? Math.round(raw.h) : null,
  };
}

/**
 * 规范化正文块数组：逐块白名单重建（防原型污染，同 normalizeTask 手法），
 * 非法块剥除；文本总量（BODY_TEXT_MAX）/ 每任务图片数（IMAGES_MAX_PER_TASK）
 * 双重预算，超预算按序截断或丢弃。非数组输入 → []。空文本段落剥除。
 */
export function normalizeBody(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  let images = 0;
  let textBudget = BODY_TEXT_MAX;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'p') {
      const text = typeof item.text === 'string' ? item.text.replace(/\r/g, '').trim() : '';
      if (!text || textBudget <= 0) continue;
      const take = text.slice(0, textBudget);
      textBudget -= take.length;
      out.push({ type: 'p', text: take });
    } else if (item.type === 'img' && images < IMAGES_MAX_PER_TASK) {
      const block = normalizeImgBlock(item);
      if (block) {
        out.push(block);
        images += 1;
      }
    }
  }
  return out;
}

/** 旧备注 → 正文段落（按行拆段）。结果已过 normalizeBody，可直接入任务。 */
export function bodyFromNotes(notes) {
  const s = typeof notes === 'string' ? notes : '';
  if (!s.trim()) return [];
  return normalizeBody(
    s
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ type: 'p', text }))
  );
}

/** 正文纯文本（段落换行拼接），用于搜索。 */
export function bodyText(body) {
  if (!Array.isArray(body)) return '';
  return body
    .filter((b) => b && b.type === 'p')
    .map((b) => b.text)
    .join('\n');
}

/** 首段摘要（折叠空白 + 截断），用于列表卡片单行展示。 */
export function bodySummary(body, max = 60) {
  const first = Array.isArray(body) ? body.find((b) => b && b.type === 'p') : null;
  if (!first) return '';
  const s = first.text.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function countImages(body) {
  if (!Array.isArray(body)) return 0;
  return body.filter((b) => b && b.type === 'img').length;
}
