<template>
  <div id="mobile-drawer-backdrop" class="drawer-backdrop" :hidden="!ui.state.drawerOpen" @click="ui.closeDrawer()"></div>
  <aside id="mobile-drawer" class="mobile-drawer" :hidden="!ui.state.drawerOpen" aria-label="移动菜单">
    <div class="drawer-head">
      <strong>work-todo</strong>
      <button type="button" id="btn-close-drawer" class="btn-icon" aria-label="关闭菜单" @click="ui.closeDrawer()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
      </button>
    </div>
    <nav class="nav" id="nav-mobile" aria-label="移动视图">
      <button
        v-for="item in navItems"
        :key="item.view"
        type="button"
        class="nav-item"
        :class="{ active: isActive(item.view) }"
        :data-view="item.view"
        @click="go(item.view)"
      >{{ item.label }} <span class="n">{{ counts[item.view] }}</span></button>
    </nav>
    <div class="drawer-ops">
      <button
        type="button"
        id="btn-settings-mobile"
        class="drawer-settings"
        @click="goSettings"
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
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ThemeToggle from './ThemeToggle.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { navCounts } from '../core/filters.js';

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

function isActive(view) {
  return !ui.state.filters.projectId && ui.state.viewMode === view;
}

function go(view) {
  router.push('/' + view);
  ui.closeDrawer();
}

function goSettings() {
  ui.closeDrawer();
  ui.openSettingsModal(document.getElementById('btn-settings-mobile'));
}
</script>
