<template>
  <aside class="side">
    <nav class="nav" id="nav" aria-label="视图">
      <button
        v-for="item in navItems"
        :key="item.view"
        type="button"
        class="nav-item"
        :class="{ active: isActive(item.view) }"
        :data-view="item.view"
        @click="go(item.view)"
      >{{ item.label }} <span class="n" :id="'nav-count-' + item.view">{{ counts[item.view] }}</span></button>
    </nav>

    <div class="side-scroll">
    <div class="side-sec" id="project-section">
      <div class="side-sec-head">
        <span>项目</span>
        <button type="button" id="btn-new-project" aria-label="新建项目" @click="newProject">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <ProjectList />
      <div class="proj-progress" id="project-progress" :hidden="!progress">
        <i :style="{ width: progress ? progress + '%' : '0%' }"></i>
      </div>
    </div>
    </div>

    <div class="side-foot">
      <div class="side-foot-row">
        <button
          type="button"
          id="btn-settings"
          class="side-settings"
          aria-label="打开设置"
          @click="openSettings"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="2.25" stroke="currentColor" stroke-width="1.4" />
            <path
              d="M8 1.6l.7 1.9a4.7 4.7 0 0 1 1.6.66l1.97-.6 1.17 2.02-1.27 1.6a4.75 4.75 0 0 1 0 1.84l1.27 1.6-1.17 2.02-1.97-.6a4.7 4.7 0 0 1-1.6.66L8 14.4l-.7-1.9a4.7 4.7 0 0 1-1.6-.66l-1.97.6-1.17-2.02 1.27-1.6a4.75 4.75 0 0 1 0-1.84L2.56 5.38l1.17-2.02 1.97.6a4.7 4.7 0 0 1 1.6-.66L8 1.6Z"
              stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"
            />
          </svg>
          <span>设置</span>
        </button>
        <ThemeToggle />
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ProjectList from './ProjectList.vue';
import ThemeToggle from './ThemeToggle.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { navCounts, projectStats } from '../core/filters.js';

const tasks = useTaskStore();
const ui = useUiStore();
const router = useRouter();

const navItems = [
  { view: 'today', label: '今天' },
  { view: 'week', label: '本周' },
  { view: 'dayline', label: '日程' },
  { view: 'all', label: '全部' },
  { view: 'done', label: '已完成' },
  { view: 'review', label: '本周回顾' },
];

const counts = computed(() => navCounts(tasks.state.tasks));

const progress = computed(() => {
  if (!ui.state.filters.projectId) return 0;
  const st = projectStats(tasks.state.tasks, ui.state.filters.projectId);
  return st.total ? Math.round((st.done / st.total) * 100) : 0;
});

function isActive(view) {
  return !ui.state.filters.projectId && ui.state.viewMode === view;
}

function go(view) {
  router.push('/' + view);
  ui.closeDrawer();
}

function newProject() {
  ui.openProjectModal(null, document.getElementById('btn-new-project'));
}

function openSettings() {
  ui.openSettingsModal(document.getElementById('btn-settings'));
}
</script>
