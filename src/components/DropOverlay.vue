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
      <p v-if="targetName" class="drop-overlay-sub">将记入「{{ targetName }}」</p>
    </div>
  </div>
</template>

<script setup>
/* 全窗口拖入文字即建任务：拖动期间浮层提示，松手按速记条默认值
 * （截止今天 / 优先级中 / 归属当前项目）直接建任务，toast 可撤销。
 * 仅接受文字（dataTransfer.types 含 text/plain）；拖文件只兜底
 * preventDefault 防止 WebView2 把文件当导航打开。 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { parseDroppedText } from '../core/tasks.js';
import { todayString } from '../core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();

const active = ref(false);
// dragenter/dragleave 在子元素边界成对触发，用配对计数避免闪烁
let depth = 0;
// dragstart 只会由应用内拖选/拖动触发，借此豁免内部拖放（保留输入框原生行为）
let internal = false;

const targetName = computed(() => {
  const p = ui.state.filters.projectId ? tasks.getProject(ui.state.filters.projectId) : null;
  return p ? p.name : '';
});

function hasPlainText(e) {
  const types = e.dataTransfer && e.dataTransfer.types;
  return !!types && Array.from(types).includes('text/plain');
}

function hide() {
  depth = 0;
  active.value = false;
}

function onDragEnter(e) {
  if (internal || !hasPlainText(e)) return;
  depth += 1;
  active.value = true;
}

function onDragOver(e) {
  if (internal) return;
  // 必须 preventDefault：drop 才会触发；同时拦下拖文件进入时的默认打开行为
  e.preventDefault();
  if (active.value && e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

function onDragLeave() {
  if (internal || !active.value) return;
  depth -= 1;
  if (depth <= 0) hide();
}

function onDrop(e) {
  if (internal) return;
  e.preventDefault();
  hide();
  const hasText = hasPlainText(e);
  const parsed = parseDroppedText(hasText ? e.dataTransfer.getData('text/plain') : '');
  if (!parsed) {
    if (!hasText) ui.showToast('仅支持拖入文字');
    return;
  }
  const task = tasks.createTask({
    title: parsed.title,
    status: 'todo',
    priority: 'medium',
    dueDate: todayString(),
    dueTime: null,
    notes: parsed.notes,
    projectId: ui.state.filters.projectId || null,
  });
  ui.showToast('已存入今天', '撤销', () => tasks.removeTask(task.id));
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
