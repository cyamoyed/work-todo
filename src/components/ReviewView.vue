<template>
  <div id="task-list" class="task-list" aria-live="polite">
    <div class="review-block">
      <h3>本周已完成（{{ week.start }} ~ {{ week.end }}）</h3>
      <div class="review-empty" v-if="!done.length">本周还没有完成的任务。推进中的事项仍在「今天 / 本周」视图。</div>
      <div class="review-item" v-for="t in done" :key="t.id">
        <span class="when">{{ (t.completedAt || t.updatedAt || '').slice(0, 10) }}</span>
        <div class="review-main">
          <div class="task-title" @click="edit(t.id)">{{ t.title }}</div>
          <div class="task-notes" v-if="t.notes">{{ t.notes }}</div>
        </div>
      </div>
    </div>

    <div class="review-block" v-if="openWeek.length">
      <h3>仍在推进（{{ openWeek.length }} 项）</h3>
      <TaskItem v-for="t in openWeek" :key="t.id" :task="t" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import TaskItem from './TaskItem.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { reviewBlocks, visibleTasks } from '../core/filters.js';

const tasks = useTaskStore();
const ui = useUiStore();

const week = computed(() => reviewBlocks(tasks.state.tasks).week);
const done = computed(() => reviewBlocks(tasks.state.tasks).done);
const openWeek = computed(() =>
  visibleTasks(tasks.state.tasks, ui.state.filters, ui.state.sortMode).filter((t) => t.status !== 'done')
);

function edit(id) {
  ui.openTaskModal(id);
}
</script>
