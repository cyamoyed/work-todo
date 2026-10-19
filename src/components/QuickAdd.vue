<template>
  <form id="quick-add-form" class="capture" autocomplete="off" @submit.prevent="submit">
    <div class="capture-main">
      <span class="capture-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </span>
      <input
        id="quick-title"
        ref="titleInput"
        v-model="title"
        type="text"
        maxlength="120"
        :placeholder="placeholder"
        aria-label="快速记一笔"
        @keydown.escape.prevent="blurInput"
        @keydown.enter.prevent="submit"
      />
      <button type="button" id="btn-new" class="btn-new-task" @click="openFull">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
        </svg>
        <span>新建任务</span>
      </button>
    </div>

    <!-- 作用于本条的表单字段；灰底 + 分段控件，区别于下方筛选 -->
    <div class="capture-attrs" aria-label="本条属性">
      <div class="attr-field">
        <span class="lab">截止</span>
        <div class="segmented" role="group" aria-label="截止">
          <button
            v-for="d in dueOptions"
            :key="d.value"
            type="button"
            :class="{ active: due === d.value }"
            :data-due="d.value"
            @mousedown.prevent
            @click="due = d.value"
          >{{ d.label }}</button>
        </div>
      </div>
      <div class="attr-field">
        <span class="lab">优先级</span>
        <div class="segmented prio" role="group" aria-label="优先级">
          <button
            v-for="p in prioOptions"
            :key="p.value"
            type="button"
            class="seg-prio"
            :class="[p.value, { active: priority === p.value }]"
            :data-prio="p.value"
            @mousedown.prevent
            @click="priority = p.value"
          ><i aria-hidden="true"></i>{{ p.label }}</button>
        </div>
      </div>
    </div>
  </form>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { addDays, todayString } from '../core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();
const title = ref('');
const titleInput = ref(null);

const due = ref('today');
const priority = ref('medium');

const dueOptions = [
  { value: 'today', label: '今天' },
  { value: 'tomorrow', label: '明天' },
  { value: '', label: '无' },
];
const prioOptions = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const placeholder = computed(() => {
  const p = ui.state.filters.projectId ? tasks.getProject(ui.state.filters.projectId) : null;
  return p ? `记入「${p.name}」，Enter 保存…` : '想到什么，记一笔…';
});

function focusInput() {
  if (titleInput.value) titleInput.value.focus();
}

function blurInput() {
  if (titleInput.value) titleInput.value.blur();
}

function openFull() {
  ui.openTaskModal(null, document.getElementById('btn-new'));
}

function submit() {
  const t = title.value.trim();
  if (!t) return;
  const dueDate = due.value === 'today' ? todayString() : due.value === 'tomorrow' ? addDays(todayString(), 1) : null;
  tasks.createTask({
    title: t,
    status: 'todo',
    priority: priority.value,
    dueDate,
    dueTime: null,
    notes: '',
    projectId: ui.state.filters.projectId || null,
  });
  title.value = '';
  due.value = 'today';
  priority.value = 'medium';
  ui.showToast(dueDate === todayString() ? '已存入今天' : dueDate ? '已存入明天' : '已创建任务');
}

defineExpose({ focusInput });
</script>
