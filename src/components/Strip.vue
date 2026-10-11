<template>
  <div class="strip" id="strip" aria-label="今日概览">
    <template v-if="project">
      <div class="proj">
        <i :class="'dotc-' + projColorKey"></i>{{ project.name }}
      </div>
      <div class="meta">{{ projectStats.open }} 未完成 · {{ projectStats.done }} 已完成 · 共 {{ projectStats.total }}</div>
      <div class="sep"></div>
    </template>
    <button
      type="button"
      class="stat-chip"
      :class="{ active: ui.state.filters.range === 'today' }"
      :aria-pressed="ui.state.filters.range === 'today' ? 'true' : 'false'"
      title="筛选：待推进（今天到期与逾期）"
      @click="setRange('today')"
    >待推进 <b class="stat-n">{{ stats.todayOpen }}</b></button>
    <button
      type="button"
      class="stat-chip"
      :class="{ active: ui.state.filters.range === 'due-today' }"
      :aria-pressed="ui.state.filters.range === 'due-today' ? 'true' : 'false'"
      title="筛选：今日到期（不含逾期）"
      @click="setRange('due-today')"
    >今日到期 <b class="stat-n">{{ stats.dueToday }}</b></button>
    <button
      type="button"
      class="stat-chip"
      :class="{ active: ui.state.filters.range === 'overdue', alert: stats.overdue > 0 && ui.state.filters.range !== 'overdue' }"
      :aria-pressed="ui.state.filters.range === 'overdue' ? 'true' : 'false'"
      title="筛选：逾期未完成"
      @click="setRange('overdue')"
    >逾期 <b class="stat-n">{{ stats.overdue }}</b></button>
    <button
      type="button"
      class="stat-chip"
      :class="{ active: ui.state.filters.status === 'in-progress' }"
      :aria-pressed="ui.state.filters.status === 'in-progress' ? 'true' : 'false'"
      title="筛选：进行中"
      @click="toggleInProgress"
    >进行中 <b class="stat-n">{{ stats.inProgress }}</b></button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { stripStats, projectStats as projectStatsOf } from '../core/filters.js';

const tasks = useTaskStore();
const ui = useUiStore();

const project = computed(() =>
  ui.state.filters.projectId ? tasks.getProject(ui.state.filters.projectId) : null
);
const projColorKey = computed(() => (project.value ? project.value.color : 'slate'));
const projectStats = computed(() =>
  projectStatsOf(tasks.state.tasks, ui.state.filters.projectId)
);
const stats = computed(() => stripStats(tasks.state.tasks));

/** Toggle a stat chip's range filter; clearing returns to the view's own range. */
function setRange(v) {
  const next = ui.state.filters.range === v ? defaultRange() : v;
  ui.setFilters({ range: next });
}

function toggleInProgress() {
  const cur = ui.state.filters.status;
  ui.setFilters({ status: cur === 'in-progress' ? 'all' : 'in-progress' });
}

function defaultRange() {
  const vm = ui.state.viewMode;
  if (vm === 'today') return 'today';
  if (vm === 'week') return 'week';
  return 'all';
}
</script>
