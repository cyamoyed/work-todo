<template>
  <form id="quick-add-form" class="quick" autocomplete="off" @submit.prevent="submit">
    <input
      id="quick-title"
      v-model="title"
      type="text"
      maxlength="120"
      :placeholder="placeholder"
      aria-label="快速添加任务标题"
    />
    <div class="quick-extra" aria-label="快速添加选项">
      <span class="quick-extra-label">截止</span>
      <button
        v-for="d in dueOptions"
        :key="d.value"
        type="button"
        class="chip"
        :class="{ active: due === d.value }"
        @mousedown.prevent
        @click="due = d.value"
      >{{ d.label }}</button>
      <span class="quick-sep" aria-hidden="true"></span>
      <span class="quick-extra-label">优先级</span>
      <button
        v-for="p in prioOptions"
        :key="p.value"
        type="button"
        class="chip"
        :class="{ active: priority === p.value }"
        @mousedown.prevent
        @click="priority = p.value"
      >{{ p.label }}</button>
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

// 常态只占一行;聚焦后 :focus-within 展开快捷选项(mousedown.prevent 保住焦点)
const due = ref('today');
const priority = ref('medium');

const dueOptions = [
  { value: 'today', label: '今天' },
  { value: 'tomorrow', label: '明天' },
  { value: '', label: '无日期' },
];
const prioOptions = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

const placeholder = computed(() => {
  const p = ui.state.filters.projectId ? tasks.getProject(ui.state.filters.projectId) : null;
  return p ? `记入「${p.name}」，Enter 保存…` : '快速记一笔，Enter 存入今天…';
});

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
</script>
