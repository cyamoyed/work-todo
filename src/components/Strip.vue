<template>
  <div class="strip" id="strip" aria-label="今日概览">
    <template v-if="project">
      <div class="proj">
        <i :class="'dotc-' + projColorKey"></i>{{ project.name }}
      </div>
      <div class="meta">{{ projectStats.open }} 未完成 · {{ projectStats.done }} 已完成 · 共 {{ projectStats.total }}</div>
      <div class="sep"></div>
    </template>
    <div class="lead">{{ stats.todayOpen }} 项待推进</div>
    <div class="sep"></div>
    <div class="meta">今日到期 {{ stats.dueToday }}</div>
    <div class="sep"></div>
    <div class="meta" :class="{ alert: stats.overdue > 0 }">逾期 {{ stats.overdue }}</div>
    <div class="sep"></div>
    <div class="meta">进行中 {{ stats.inProgress }}</div>
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
</script>
