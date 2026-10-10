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
      <ThemeToggle />
      <button type="button" id="btn-export-mobile" @click="exportMobile">导出数据</button>
      <button type="button" id="btn-import-mobile" @click="importMobile">导入数据</button>
      <button v-if="desktop" type="button" id="btn-backup-mobile" @click="backupMobile">数据备份</button>
      <button type="button" id="btn-sync-settings-mobile" @click="syncMobile">同步设置</button>
      <button type="button" id="btn-check-update-mobile" @click="updateMobile">检查更新</button>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ThemeToggle from './ThemeToggle.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { useTransfer } from '../composables/useTransfer.js';
import { useUpdateCheck } from '../composables/useUpdateCheck.js';
import { isTauri } from '../lib/tauri.js';
import { navCounts } from '../core/filters.js';

const tasks = useTaskStore();
const ui = useUiStore();
const router = useRouter();
const { doExport } = useTransfer();
const { checkNow } = useUpdateCheck();
const desktop = isTauri();

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

function exportMobile() {
  doExport();
  ui.closeDrawer();
}

function importMobile() {
  ui.closeDrawer();
  const input = document.getElementById('import-file');
  if (input) input.click();
}

function backupMobile() {
  ui.closeDrawer();
  ui.openBackupModal(null);
}

function syncMobile() {
  ui.closeDrawer();
  ui.openSyncModal(null);
}

function updateMobile() {
  ui.closeDrawer();
  checkNow(null);
}
</script>
