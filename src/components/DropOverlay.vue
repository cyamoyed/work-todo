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
 * 任务编辑弹窗打开时整体让位：拖放由正文编辑器接管（插入正文，不建新任务）。 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { parseDroppedText, titleFromFile } from '../core/tasks.js';
import { countImages } from '../core/body.js';
import { compressImage } from '../lib/imageCompress.js';
import { IMAGES_MAX_PER_TASK } from '../constants.js';
import { todayString } from '../core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();

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
  return draggingImages.value ? `图片将存入正文${target}` : `文字进标题与正文${target}`;
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

async function onDrop(e) {
  if (internal) return;
  e.preventDefault();
  if (ui.state.taskModalOpen) return; // 编辑器已接管插入
  hide();
  const hasText = hasPlainText(e);
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
  const images = files.filter((f) => f.type && f.type.startsWith('image/'));
  const parsed = parseDroppedText(hasText ? e.dataTransfer.getData('text/plain') : '');
  const body = parsed ? parsed.body.map((b) => ({ ...b })) : [];

  let failures = 0;
  let firstError = '';
  for (const file of images) {
    if (countImages(body) >= IMAGES_MAX_PER_TASK) break;
    try {
      const { src, w, h } = await compressImage(file);
      body.push({ type: 'img', src, w, h });
    } catch (err) {
      failures += 1;
      if (!firstError) firstError = (err && err.message) || '图片插入失败';
    }
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
  ui.showToast(`已存入今天${suffix}`, '撤销', () => tasks.removeTask(task.id));
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
  document.addEventListener('dragstart', markInternal);
  document.addEventListener('dragend', clearInternal);
});

onUnmounted(() => {
  window.removeEventListener('dragenter', onDragEnter);
  window.removeEventListener('dragover', onDragOver);
  window.removeEventListener('dragleave', onDragLeave);
  window.removeEventListener('drop', onDrop);
  document.removeEventListener('dragstart', markInternal);
  document.removeEventListener('dragend', clearInternal);
});
</script>
