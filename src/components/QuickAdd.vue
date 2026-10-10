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
    <button type="submit" class="btn btn-primary">存入</button>
  </form>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { todayString } from '../core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();
const title = ref('');

const placeholder = computed(() => {
  const p = ui.state.filters.projectId ? tasks.getProject(ui.state.filters.projectId) : null;
  return p ? `记入「${p.name}」，Enter 保存…` : '快速记一笔，Enter 存入今天…';
});

function submit() {
  const t = title.value.trim();
  if (!t) return;
  tasks.createTask({
    title: t,
    status: 'todo',
    priority: 'medium',
    dueDate: todayString(),
    dueTime: null,
    notes: '',
    projectId: ui.state.filters.projectId || null,
  });
  title.value = '';
  ui.showToast('已存入今天');
}
</script>
