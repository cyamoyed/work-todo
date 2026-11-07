<template>
  <div id="drop-overlay" class="drop-overlay" :hidden="!active">
    <div class="drop-overlay-box">
      <span class="drop-overlay-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M11 3.5v9M7 9.2l4 4 4-4"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M4 15v2.5A1.5 1.5 0 0 0 5.5 19h11a1.5 1.5 0 0 0 1.5-1.5V15"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      </span>
      <p class="drop-overlay-title">松开鼠标，创建任务</p>
      <p class="drop-overlay-sub">{{ subLine }}</p>
    </div>
  </div>
</template>

<script setup>
/* 全窗口拖入文字 / 图片即建任务：拖动期间浮层提示，松手按速记条默认值
 * （截止今天 / 优先级中 / 归属当前项目）直接建任务，toast 可撤销。
 * 接受 text/plain 与图片文件（多图进同一任务正文）；其他文件兜底
 * preventDefault 防止 WebView2 把文件当导航打开，并提示仅支持文字或图片。
 * 任务编辑弹窗打开时整体让位：拖放与图片粘贴都由正文编辑器接管（插入正文，
 * 不建新任务）。
 * AI 识别开启时（store/ai.js）：拖入文本先按首行兜底建任务，AI 返回后替换
 * 标题并把完整原文放回正文；拖入/粘贴的图片用首图调视觉模型识别内容拟标题
 * （无文字时的图片任务），失败回退文件名/首行兜底，不阻塞捕获。 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { useAiStore } from '../store/ai.js';
import { parseDroppedText, titleFromFile } from '../core/tasks.js';
import { countImages, bodyFromNotes } from '../core/body.js';
import { compressImage } from '../lib/imageCompress.js';
import { generateTaskTitle, generateImageTitle } from '../lib/ai.js';
import { isTypingTarget } from '../composables/useKeyboardShortcuts.js';
import { IMAGES_MAX_PER_TASK } from '../constants.js';
import { todayString } from '../core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();
const ai = useAiStore();
ai.init();

const active = ref(false);
// dragenter/dragleave 在子元素边界成对触发，用配对计数避免闪烁
let depth = 0;
// dragstart 只会由应用内拖选/拖动触发，借此豁免内部拖放（保留输入框原生行为）
let internal = false;
// 当前拖动载荷里是否带有图片文件（决定浮层副标题；ref 保证 subLine 响应式更新）
const draggingImages = ref(false);

const targetName = computed(() => {
  const p = ui.state.filters.projectId ? tasks.getProject(ui.state.filters.projectId) : null;
  return p ? p.name : '';
});

const subLine = computed(() => {
  const target = targetName.value ? `，记入「${targetName.value}」` : '';
  if (draggingImages.value) return `图片将存入正文${target}`;
  return ai.isReady() ? `AI 生成标题，原文进正文${target}` : `文字进标题与正文${target}`;
});

function dragTypes(e) {
  const types = e.dataTransfer && e.dataTransfer.types;
  return types ? Array.from(types) : [];
}

function hasPlainText(e) {
  return dragTypes(e).includes('text/plain');
}

function hasPayload(e) {
  const types = dragTypes(e);
  return types.includes('text/plain') || types.includes('Files');
}

function hide() {
  depth = 0;
  active.value = false;
  draggingImages.value = false;
}

function onDragEnter(e) {
  if (internal || ui.state.taskModalOpen || !hasPayload(e)) return;
  depth += 1;
  draggingImages.value = !hasPlainText(e);
  active.value = true;
}

function onDragOver(e) {
  if (internal) return;
  // 必须 preventDefault：drop 才会触发；同时拦下拖文件进入时的默认打开行为。
  // 弹窗打开时只兜底（编辑器负责插入），不显示浮层。
  e.preventDefault();
  if (active.value && e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

function onDragLeave() {
  if (internal || ui.state.taskModalOpen || !active.value) return;
  depth -= 1;
  if (depth <= 0) hide();
}

/** 压缩图片文件 → 正文 img 块（上限预算 + 失败收集，拖入/粘贴共用）。 */
async function buildImageBody(files) {
  const body = [];
  let failures = 0;
  let firstError = '';
  for (const file of files) {
    if (countImages(body) >= IMAGES_MAX_PER_TASK) break;
    try {
      const { src, w, h } = await compressImage(file);
      body.push({ type: 'img', src, w, h });
    } catch (err) {
      failures += 1;
      if (!firstError) firstError = (err && err.message) || '图片插入失败';
    }
  }
  return { body, failures, firstError };
}

/** 图片任务收尾：toast + AI 视觉标题增强（守卫同文字路径）。 */
function finishImageTask(task, body, baseMessage, undo) {
  const imageAiActive = !!ai.isReady();
  ui.showToast(imageAiActive ? `${baseMessage} · AI 识别图片中` : baseMessage, '撤销', undo);
  if (imageAiActive) {
    const firstSrc = (body.find((b) => b && b.type === 'img') || {}).src || '';
    enhanceWithAiImage(task, firstSrc, baseMessage, undo);
  }
}

async function onDrop(e) {
  if (internal) return;
  e.preventDefault();
  if (ui.state.taskModalOpen) return; // 编辑器已接管插入
  hide();
  const hasText = hasPlainText(e);
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
  const images = files.filter((f) => f.type && f.type.startsWith('image/'));
  const rawText = hasText ? e.dataTransfer.getData('text/plain') : '';
  const parsed = parseDroppedText(rawText);
  let body = parsed ? parsed.body.map((b) => ({ ...b })) : [];
  let failures = 0;
  let firstError = '';
  if (images.length) {
    const img = await buildImageBody(images);
    body = body.concat(img.body);
    failures = img.failures;
    firstError = img.firstError;
  }

  if (!parsed && !body.length) {
    ui.showToast(firstError || '仅支持拖入文字或图片');
    return;
  }
  const title = parsed ? parsed.title : titleFromFile(images[0] && images[0].name);
  const task = tasks.createTask({
    title,
    status: 'todo',
    priority: 'medium',
    dueDate: todayString(),
    dueTime: null,
    body,
    projectId: ui.state.filters.projectId || null,
  });
  const suffix = failures ? ` · ${failures} 张图片未插入` : '';
  const baseMessage = `已存入今天${suffix}`;
  const undo = () => tasks.removeTask(task.id);
  // AI 只参与纯文本（文字标题）与纯图片（视觉标题）路径；混合拖入文字优先，不双重识别
  const textAiActive = !!(parsed && ai.isReady());
  ui.showToast(
    textAiActive ? `${baseMessage} · AI 生成标题中` : baseMessage,
    '撤销',
    undo
  );
  if (textAiActive) {
    enhanceWithAi(task, rawText, baseMessage, undo);
  } else if (!parsed && body.length) {
    finishImageTask(task, body, baseMessage, undo);
  }
}

/** AI 拟标题：请求回来后守卫再落库——任务已撤销或被用户编辑过则放弃，
 *  不覆盖现场；正文替换为完整原文（首行也进正文）。 */
async function enhanceWithAi(task, rawText, baseMessage, undo) {
  const res = await generateTaskTitle({ text: rawText, config: ai.state });
  const fresh = tasks.getTask(task.id);
  if (!fresh || fresh.updatedAt !== fresh.createdAt) return;
  if (res.ok) {
    tasks.updateTask(task.id, { title: res.title, body: bodyFromNotes(rawText) });
    ui.showToast(`${baseMessage} · 标题已生成`, '撤销', undo);
  } else {
    ui.showToast(`${baseMessage} · AI 标题生成失败，已用首行做标题`, '撤销', undo);
  }
}

/** AI 视觉识别首图拟标题：守卫同上，失败保持文件名标题。 */
async function enhanceWithAiImage(task, dataUrl, baseMessage, undo) {
  const res = await generateImageTitle({ dataUrl, config: ai.state });
  const fresh = tasks.getTask(task.id);
  if (!fresh || fresh.updatedAt !== fresh.createdAt) return;
  if (res.ok) {
    tasks.updateTask(task.id, { title: res.title });
    ui.showToast(`${baseMessage} · 标题已生成`, '撤销', undo);
  } else {
    ui.showToast(`${baseMessage} · AI 图片识别失败，已用文件名做标题`, '撤销', undo);
  }
}

/* —— 粘贴图片即建任务（全局）：与拖入同管线 —— */

function extractImageFiles(dataTransfer) {
  const files = [];
  for (const item of (dataTransfer && dataTransfer.items) || []) {
    if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

function onPaste(e) {
  if (ui.state.taskModalOpen) return; // 编辑器已接管（BodyEditor @paste 插入正文）
  const images = extractImageFiles(e.clipboardData);
  if (!images.length) return; // 文本/富文本粘贴一律走原生
  // 焦点在可编辑元素且剪贴板带文字 → 用户正在输入，让位原生粘贴
  const cd = e.clipboardData;
  const text = cd && typeof cd.getData === 'function' ? cd.getData('text/plain') || '' : '';
  if (text.trim() && isTypingTarget(e.target)) return;
  e.preventDefault();

  createFromImageFiles(images);
}

async function createFromImageFiles(files) {
  const { body, failures, firstError } = await buildImageBody(files);
  if (!body.length) {
    ui.showToast(firstError || '仅支持拖入文字或图片');
    return;
  }
  const task = tasks.createTask({
    title: titleFromFile(files[0] && files[0].name),
    status: 'todo',
    priority: 'medium',
    dueDate: todayString(),
    dueTime: null,
    body,
    projectId: ui.state.filters.projectId || null,
  });
  const suffix = failures ? ` · ${failures} 张图片未插入` : '';
  const undo = () => tasks.removeTask(task.id);
  finishImageTask(task, body, `已存入今天${suffix}`, undo);
}

function markInternal() {
  internal = true;
  hide();
}

function clearInternal() {
  internal = false;
}

onMounted(() => {
  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  window.addEventListener('paste', onPaste);
  document.addEventListener('dragstart', markInternal);
  document.addEventListener('dragend', clearInternal);
});

onUnmounted(() => {
  window.removeEventListener('dragenter', onDragEnter);
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('dragleave', onDragLeave);
  window.removeEventListener('drop', onDrop);
  window.removeEventListener('paste', onPaste);
  document.removeEventListener('dragstart', markInternal);
  document.removeEventListener('dragend', clearInternal);
});
</script>
