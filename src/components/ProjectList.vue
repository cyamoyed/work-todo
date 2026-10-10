<template>
  <div id="project-list">
    <div v-if="!tasks.state.projects.length" class="proj-empty">还没有项目</div>
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
      <span class="swatch" :class="'dotc-' + p.color"></span>
      <span class="name">{{ p.name }}</span>
      <span class="n">{{ projectStats(tasks.state.tasks, p.id).open }}</span>
      <button type="button" class="more" aria-label="项目操作" @click.stop="openMenu($event, p.id)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="3" cy="8" r="1.1" fill="currentColor" />
          <circle cx="8" cy="8" r="1.1" fill="currentColor" />
          <circle cx="13" cy="8" r="1.1" fill="currentColor" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { projectStats } from '../core/filters.js';

const tasks = useTaskStore();
const ui = useUiStore();
const router = useRouter();

function goProject(id) {
  router.push('/project/' + id);
}

function openMenu(event, id) {
  ui.openProjectMenu(event.currentTarget, id);
}
</script>
