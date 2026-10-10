<template>
  <div id="project-list">
    <div
      v-if="!tasks.state.projects.length"
      :style="{ padding: '8px 10px', fontSize: '12px', color: 'var(--faint)', lineHeight: '1.6' }"
    >还没有项目</div>
    <div
      v-for="p in tasks.state.projects"
      :key="p.id"
      class="proj-item"
      :class="{ active: ui.state.filters.projectId === p.id }"
      :data-project="p.id"
      role="button"
      tabindex="0"
      @click="goProject(p.id)"
      @keydown.enter.prevent="goProject(p.id)"
      @keydown.space.prevent="goProject(p.id)"
    >
      <span class="swatch" :style="{ background: colorOf(p.color) }"></span>
      <span class="name">{{ p.name }}</span>
      <span class="n">{{ projectStats(tasks.state.tasks, p.id).open }}</span>
      <button type="button" class="more" aria-label="项目操作" @click.stop="openMenu($event, p.id)">···</button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { projectStats } from '../core/filters.js';
import { PROJECT_COLORS } from '../constants.js';

const tasks = useTaskStore();
const ui = useUiStore();
const router = useRouter();

function colorOf(color) {
  return PROJECT_COLORS[color] || PROJECT_COLORS.slate;
}

function goProject(id) {
  router.push('/project/' + id);
}

function openMenu(event, id) {
  ui.openProjectMenu(event.currentTarget, id);
}
</script>
