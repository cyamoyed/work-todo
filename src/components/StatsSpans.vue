<template>
  <!-- legacy observability nodes kept for tests / stats -->
  <span id="today-label" hidden>{{ todayLabel }}</span>
  <span id="stat-done" hidden>{{ stats.doneToday }}</span>
  <span id="stat-total" hidden>{{ stats.todayScope }}</span>
  <span id="stat-active" hidden>{{ stats.inProgress }}</span>
  <span id="stat-todo" hidden>{{ stats.dueToday }}</span>
  <span id="stat-overdue" hidden :class="{ 'is-alert': stats.overdue > 0 }">{{ stats.overdue }}</span>
  <div id="progress-fill" hidden :style="{ width: progressPct }"></div>
  <p id="overview-sub" hidden>{{ sub }}</p>
</template>

<script setup>
import { computed } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { stripStats, overviewSub } from '../core/filters.js';
import { formatTodayLabel } from '../core/dates.js';

const tasks = useTaskStore();

const stats = computed(() => stripStats(tasks.state.tasks));
const sub = computed(() => overviewSub(tasks.state.tasks));
const todayLabel = computed(() => formatTodayLabel());
const progressPct = computed(() => {
  const s = stats.value;
  return (s.todayScope ? Math.round((s.doneToday / s.todayScope) * 100) : 0) + '%';
});
</script>
