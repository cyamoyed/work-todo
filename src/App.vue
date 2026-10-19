<template>
  <div class="app">
    <SideNav />

    <main class="main">
      <TopBar />

      <div class="body">
        <QuickAdd ref="quickAddRef" />
        <StatsSpans />
        <Strip />
        <FilterBar />

        <ErrorBanner />

        <!-- 固定上半区（速记/统计/筛选）之下，只有任务列表滚动 -->
        <div class="body-scroll">
          <section class="list-section" aria-label="任务列表">
            <div class="list-head">
              <h2 class="list-title" id="list-title">{{ listTitle }}</h2>
              <p class="list-meta" id="list-meta">{{ listMeta }}</p>
            </div>
            <RouterView />
          </section>

          <footer class="footer">
            <span id="task-stats">{{ footerText }}</span>
          </footer>
        </div>
      </div>
    </main>
  </div>

  <button type="button" id="fab-new" class="fab-new" aria-label="新建任务" @click="createNew">
    <svg width="22" height="22" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  </button>

  <input
    id="import-file"
    type="file"
    accept="application/json,.json"
    hidden
    aria-label="选择要导入的 JSON 文件"
    @change="onImportFile"
  />

  <TaskFormModal />
  <ProjectModal />
  <SettingsModal />
  <BackupModal />
  <SyncSettingsModal />
  <UpdateModal />
  <ConfirmDialog />
  <MobileDrawer />
  <StatusMenu />
  <PrioMenu />
  <DueMenu />
  <InfoMenu />
  <ProjectActionsMenu />
  <BatchBar />
  <Toast />
</template>

<script setup>
import { computed, ref } from 'vue';
import SideNav from './components/SideNav.vue';
import TopBar from './components/TopBar.vue';
import StatsSpans from './components/StatsSpans.vue';
import Strip from './components/Strip.vue';
import QuickAdd from './components/QuickAdd.vue';
import FilterBar from './components/FilterBar.vue';
import ErrorBanner from './components/ErrorBanner.vue';
import TaskFormModal from './components/TaskFormModal.vue';
import ProjectModal from './components/ProjectModal.vue';
import SettingsModal from './components/SettingsModal.vue';
import BackupModal from './components/BackupModal.vue';
import SyncSettingsModal from './components/SyncSettingsModal.vue';
import UpdateModal from './components/UpdateModal.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import MobileDrawer from './components/MobileDrawer.vue';
import StatusMenu from './components/StatusMenu.vue';
import PrioMenu from './components/PrioMenu.vue';
import DueMenu from './components/DueMenu.vue';
import InfoMenu from './components/InfoMenu.vue';
import ProjectActionsMenu from './components/ProjectActionsMenu.vue';
import BatchBar from './components/BatchBar.vue';
import Toast from './components/Toast.vue';
import { useTaskStore } from './store/tasks.js';
import { useUiStore } from './store/ui.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';
import { useTransfer } from './composables/useTransfer.js';
import { footerStats, listTitleFor, visibleTasks } from './core/filters.js';
import { isCompletedThisWeek } from './core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();
const { importFile } = useTransfer();
const quickAddRef = ref(null);

// N 聚焦捕获条；Shift+N 打开完整新建表单
useKeyboardShortcuts({
  onCreateNew: () => ui.openTaskModal(null, null),
  onFocusQuickAdd: () => quickAddRef.value && quickAddRef.value.focusInput(),
});

function onImportFile(e) {
  importFile(e.target.files && e.target.files[0]);
  e.target.value = '';
}

const listTitle = computed(() =>
  listTitleFor(ui.state.viewMode, ui.state.filters, tasks.state.projects)
);

// legacy renderList meta strings
const listMeta = computed(() => {
  const visible = visibleTasks(tasks.state.tasks, ui.state.filters, ui.state.sortMode);
  const view = ui.state.viewMode;
  if (view === 'dayline') {
    return `${visible.filter((t) => t.status !== 'done').length} 项`;
  }
  if (view === 'review') {
    return `本周完成 ${tasks.state.tasks.filter((t) => isCompletedThisWeek(t)).length} 项`;
  }
  const done = visible.filter((t) => t.status === 'done');
  if (view === 'done') {
    return `${done.length} 项`;
  }
  return `${visible.filter((t) => t.status !== 'done').length} 项`;
});

const footerText = computed(() => footerStats(tasks.state.tasks).text);

function createNew() {
  ui.openTaskModal(null, document.getElementById('fab-new'));
}
</script>
