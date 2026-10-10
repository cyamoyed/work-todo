<template>
  <div class="app">
    <SideNav />

    <main class="main">
      <TopBar />

      <div class="body">
        <StatsSpans />
        <Strip />

        <QuickAdd />

        <FilterBar />

        <ErrorBanner />

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
    </main>
  </div>

  <button type="button" id="fab-new" class="fab-new" aria-label="新建任务" @click="createNew">
    <svg width="22" height="22" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  </button>

  <TaskFormModal />
  <ProjectModal />
  <BackupModal />
  <SyncSettingsModal />
  <UpdateModal />
  <ConfirmDialog />
  <MobileDrawer />
  <StatusMenu />
  <PrioMenu />
  <DueMenu />
  <ProjectActionsMenu />
  <BatchBar />
  <Toast />
</template>

<script setup>
import { computed } from 'vue';
import SideNav from './components/SideNav.vue';
import TopBar from './components/TopBar.vue';
import StatsSpans from './components/StatsSpans.vue';
import Strip from './components/Strip.vue';
import QuickAdd from './components/QuickAdd.vue';
import FilterBar from './components/FilterBar.vue';
import ErrorBanner from './components/ErrorBanner.vue';
import TaskFormModal from './components/TaskFormModal.vue';
import ProjectModal from './components/ProjectModal.vue';
import BackupModal from './components/BackupModal.vue';
import SyncSettingsModal from './components/SyncSettingsModal.vue';
import UpdateModal from './components/UpdateModal.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import MobileDrawer from './components/MobileDrawer.vue';
import StatusMenu from './components/StatusMenu.vue';
import PrioMenu from './components/PrioMenu.vue';
import DueMenu from './components/DueMenu.vue';
import ProjectActionsMenu from './components/ProjectActionsMenu.vue';
import BatchBar from './components/BatchBar.vue';
import Toast from './components/Toast.vue';
import { useTaskStore } from './store/tasks.js';
import { useUiStore } from './store/ui.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';
import { footerStats, listTitleFor, visibleTasks } from './core/filters.js';
import { isCompletedThisWeek } from './core/dates.js';

const tasks = useTaskStore();
const ui = useUiStore();

useKeyboardShortcuts({
  onCreateNew: () => ui.openTaskModal(null, null),
});

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
