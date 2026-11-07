<template>
  <div class="field body-field" id="field-body-wrap">
    <span class="field-label">正文</span>
    <div class="body-editor" :class="{ 'drag-over': dragOverEditor }">
      <div
        id="field-notes"
        ref="richEl"
        class="body-rich"
        contenteditable="true"
        data-placeholder="补充背景、链接或验收要点（可选）"
        spellcheck="false"
        @paste="onPaste"
        @click="onRichClick"
      ></div>

      <div class="body-editor-foot">
        <button type="button" id="btn-insert-image" class="btn btn-ghost body-insert" :disabled="busy" @click="pickImages">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.4" />
            <circle cx="5.8" cy="6.4" r="1.1" fill="currentColor" />
            <path d="M2.5 11.5l3.2-3 2.6 2.3 2.4-2.1 2.8 2.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>{{ busy ? '处理中…' : '插入图片' }}</span>
        </button>
        <span class="body-budget" :class="{ over: overBudget }">{{ budgetText }}</span>
      </div>
      <input ref="fileEl" id="file-image" type="file" accept="image/*" multiple hidden @change="onFiles" />
    </div>
    <p class="field-error body-error" :hidden="!error">{{ error }}</p>

    <div v-if="lightbox" class="lightbox" role="dialog" aria-label="图片预览" @click="closeLightbox">
      <img :src="lightbox.src" alt="图片预览" />
    </div>
  </div>
</template>

<script setup>
/* 正文富文本编辑器：单个 contenteditable 连续输入面，文字与内联图片像文档一样
 * 流动；Ctrl+V 粘贴截图、窗口拖图、图片点击放大（lightbox）。
 * 数据模型不变（段落 + 图片块）：输入时把 DOM 白名单序列化回块模型（只认纯文本
 * 与本编辑器插入的 data: 图片），外部带入的任何富文本标记/远程图片自动被清洗——
 * 全应用保持零 v-html，无 sanitizer 依赖。 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { compressImage } from '../lib/imageCompress.js';
import { countImages, normalizeBody } from '../core/body.js';
import { IMAGES_MAX_PER_TASK, IMAGE_DATAURL_MAX } from '../constants.js';

const IMG_SRC_RE = /^data:image\/(webp|jpeg|png|gif);base64,/;

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  // 弹窗开合（:hidden 只是隐藏不卸载）：关闭时收起 lightbox 与错误提示，避免残留遮挡
  open: { type: Boolean, default: true },
});
const emit = defineEmits(['update:modelValue']);

const richEl = ref(null);
const fileEl = ref(null);
const error = ref('');
const busy = ref(false);
const lightbox = ref(null);
const dragOverEditor = ref(false);

/* ---------- 块模型 ↔ DOM ---------- */

function hydrate(blocks) {
  const el = richEl.value;
  if (!el) return;
  el.textContent = '';
  for (const b of blocks) {
    if (b.type === 'img') {
      el.appendChild(makeImg(b));
    } else {
      const p = document.createElement('p');
      p.textContent = b.text;
      el.appendChild(p);
    }
  }
}

function makeImg(block) {
  const img = document.createElement('img');
  img.src = block.src;
  img.draggable = false;
  if (block.w) img.dataset.w = String(block.w);
  if (block.h) img.dataset.h = String(block.h);
  return img;
}

/**
 * DOM → 块模型：递归有序展平。段落/图片按出现顺序输出；块级元素（P/DIV）边界
 * 落段；<br> 换行；只认本编辑器插入的 data: 图片，外部富文本标记与远程图片被
 * 天然清洗掉（contenteditable 里浏览器会产生任意嵌套结构，递归展平才能稳）。
 */
function serialize() {
  const el = richEl.value;
  if (!el) return [];
  const out = [];
  let textBuf = '';
  const flushText = () => {
    for (const line of textBuf.split('\n')) {
      const s = line.trim();
      if (s) out.push({ type: 'p', text: s });
    }
    textBuf = '';
  };
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        textBuf += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.tagName === 'BR') {
          textBuf += '\n';
        } else if (child.tagName === 'IMG') {
          flushText();
          const src = child.getAttribute('src') || '';
          if (IMG_SRC_RE.test(src) && src.length <= IMAGE_DATAURL_MAX) {
            const w = Number(child.dataset.w);
            const h = Number(child.dataset.h);
            out.push({
              type: 'img',
              src,
              w: Number.isFinite(w) && w > 0 ? w : null,
              h: Number.isFinite(h) && h > 0 ? h : null,
            });
          }
        } else {
          walk(child);
          if (child.tagName === 'P' || child.tagName === 'DIV') flushText();
        }
      }
    }
  };
  walk(el);
  flushText();
  return normalizeBody(out);
}

/* ---------- v-model 同步 ---------- */

let lastEmitted = null;
// 图片计数走 ref：serialize 读的是 DOM（非响应式），预算展示依赖它刷新
const imgCount = ref(0);

function emitChange() {
  const blocks = serialize();
  imgCount.value = countImages(blocks);
  lastEmitted = JSON.stringify(blocks);
  emit('update:modelValue', blocks);
}

function onRichInput() {
  emitChange();
}

watch(
  () => props.modelValue,
  (v) => {
    const incoming = JSON.stringify(Array.isArray(v) ? v : []);
    if (incoming === lastEmitted) {
      lastEmitted = null;
      return;
    }
    lastEmitted = null;
    const normalized = normalizeBody(v);
    imgCount.value = countImages(normalized);
    hydrate(normalized);
  },
  { immediate: true }
);

/* ---------- 光标处插入 ---------- */

function currentRange() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && richEl.value && richEl.value.contains(sel.getRangeAt(0).startContainer)) {
    return sel.getRangeAt(0);
  }
  return null;
}

function placeCaret(node, atStart = true) {
  try {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.setStart(node, atStart ? 0 : node.childNodes.length);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  } catch (_) {
    /* 测试环境无 Range 实现时不影响编辑主流程 */
  }
}

function insertImageAtCaret(block) {
  const el = richEl.value;
  if (!el) return;
  const img = makeImg(block);
  const range = currentRange();
  if (range) {
    const rest = range.extractContents();
    range.insertNode(img);
    if (rest && rest.childNodes.length) {
      const tail = document.createElement('p');
      tail.appendChild(rest);
      img.after(tail);
      placeCaret(tail);
    } else {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      img.after(p);
      placeCaret(p);
    }
  } else {
    el.appendChild(img);
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    el.appendChild(p);
    placeCaret(p);
  }
  emitChange();
}

function insertTextAtCaret(text) {
  const el = richEl.value;
  if (!el) return;
  el.focus();
  const ok = document.execCommand && document.execCommand('insertText', false, text);
  if (!ok) {
    // 兜底：插入到末尾
    for (const line of String(text).split('\n')) {
      const p = document.createElement('p');
      p.textContent = line;
      el.appendChild(p);
    }
  }
  emitChange();
}

/* ---------- 图片进入（按钮 / 粘贴 / 拖放共用） ---------- */

function hasBudgetFor(extra = 1) {
  return imgCount.value + extra <= IMAGES_MAX_PER_TASK;
}

async function insertFiles(files) {
  const images = files.filter((f) => f && f.type && f.type.startsWith('image/'));
  if (!images.length) return;
  error.value = '';
  let firstError = '';
  for (const file of images) {
    if (!hasBudgetFor()) {
      error.value = `每个任务最多 ${IMAGES_MAX_PER_TASK} 张图片`;
      break;
    }
    busy.value = true;
    try {
      const { src, w, h } = await compressImage(file);
      insertImageAtCaret({ src, w, h });
    } catch (err) {
      if (!firstError) firstError = (err && err.message) || '图片插入失败';
    } finally {
      busy.value = false;
    }
  }
  if (firstError) error.value = firstError;
}

function pickImages() {
  if (fileEl.value) {
    fileEl.value.value = '';
    fileEl.value.click();
  }
}

async function onFiles(e) {
  const files = Array.from((e.target.files && e.target.files) || []);
  await insertFiles(files);
}

function onPaste(e) {
  const cd = e.clipboardData;
  if (!cd) return;
  const images = [];
  for (const item of cd.items || []) {
    if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) images.push(f);
    }
  }
  if (images.length) {
    e.preventDefault();
    insertFiles(images);
  }
  // 纯文本/富文本粘贴走浏览器原生插入，序列化时白名单自动清洗格式
}

/* ---------- 弹窗打开时接管窗口拖放 ---------- */

let dndDepth = 0;
let internal = false;

function dragHasFiles(e) {
  const types = e.dataTransfer && e.dataTransfer.types;
  return !!types && Array.from(types).includes('Files');
}

function onDragEnter(e) {
  if (!props.open || internal || !dragHasFiles(e)) return;
  dndDepth += 1;
  dragOverEditor.value = true;
}

function onDragOver(e) {
  if (!props.open) return;
  e.preventDefault(); // 兜底 DropOverlay 的让位路径，保证 drop 可触发
}

function onDragLeave() {
  if (!props.open) return;
  dndDepth -= 1;
  if (dndDepth <= 0) {
    dndDepth = 0;
    dragOverEditor.value = false;
  }
}

async function onWindowDrop(e) {
  if (!props.open || internal) return;
  e.preventDefault();
  dndDepth = 0;
  dragOverEditor.value = false;
  error.value = '';
  const data = e.dataTransfer || {};
  let firstError = '';
  if (data.types && Array.from(data.types).includes('text/plain')) {
    const text = data.getData('text/plain');
    if (text.trim()) insertTextAtCaret(text.replace(/\r/g, ''));
  }
  const images = Array.from(data.files || []).filter((f) => f.type && f.type.startsWith('image/'));
  for (const file of images) {
    if (!hasBudgetFor()) {
      error.value = `每个任务最多 ${IMAGES_MAX_PER_TASK} 张图片`;
      break;
    }
    busy.value = true;
    try {
      const { src, w, h } = await compressImage(file);
      insertImageAtCaret({ src, w, h });
    } catch (err) {
      if (!firstError) firstError = (err && err.message) || '图片插入失败';
    } finally {
      busy.value = false;
    }
  }
  if (firstError) error.value = firstError;
}

function markInternal() {
  internal = true;
  dndDepth = 0;
  dragOverEditor.value = false;
}

function clearInternal() {
  internal = false;
}

onMounted(() => {
  // input 用显式 addEventListener：Vue 对 @input 走 onInput 属性绑定，
  // happy-dom 里属性处理器不响应 dispatchEvent（测试环境行为会偏离真实浏览器）
  richEl.value && richEl.value.addEventListener('input', onRichInput);
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onWindowDrop);
  document.addEventListener('dragstart', markInternal);
  document.addEventListener('dragend', clearInternal);
});

onUnmounted(() => {
  richEl.value && richEl.value.removeEventListener('input', onRichInput);
  window.removeEventListener('dragenter', onDragEnter);
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('dragleave', onDragLeave);
  window.removeEventListener('drop', onWindowDrop);
  document.removeEventListener('dragstart', markInternal);
  document.removeEventListener('dragend', clearInternal);
});

/* ---------- 交互 ---------- */

function onRichClick(e) {
  if (e.target && e.target.tagName === 'IMG') {
    e.preventDefault();
    openLightbox({ src: e.target.getAttribute('src') });
  }
}

function openLightbox(block) {
  lightbox.value = block;
}

function closeLightbox() {
  lightbox.value = null;
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      lightbox.value = null;
      error.value = '';
      dndDepth = 0;
      dragOverEditor.value = false;
    }
  }
);

const overBudget = computed(() => imgCount.value > IMAGES_MAX_PER_TASK);
const budgetText = computed(() => `${imgCount.value}/${IMAGES_MAX_PER_TASK} 图`);
</script>
