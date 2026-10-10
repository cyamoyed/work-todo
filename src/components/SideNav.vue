<template>
  <aside class="side">
    <div class="logo">
      <div class="logo-mark" aria-hidden="true"><BrandMark :size="22" /></div>
      <div class="logo-text">work-todo</div>
    </div>

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

    <div class="side-foot">
      <div class="side-ops">
        <button type="button" id="btn-export" @click="doExport">导出数据</button>
        <button type="button" id="btn-import" @click="openImport">导入数据</button>
        <button v-if="desktop" type="button" id="btn-backup" @click="openBackup">数据备份</button>
        <button type="button" id="btn-sync-settings" @click="openSync">同步设置</button>
        <button
          type="button"
          id="btn-check-update"
          :disabled="updateState.status === 'checking'"
          @click="checkUpdate"
        >{{ checkLabel }}</button>
        <input
          id="import-file"
          type="file"
          accept="application/json,.json"
          hidden
          aria-label="选择要导入的 JSON 文件"
          @change="onImportFile"
        />
      </div>
      <div class="side-hint">
        <div class="side-ver">
          <button
            type="button"
            id="app-version"
            :class="{ 'has-update': hasUpdate }"
            :title="hasUpdate ? '发现新版本，点击查看' : '当前版本，点击检查更新'"
            @click="versionClick"
          >
            <i v-if="hasUpdate" class="version-dot" aria-hidden="true"></i>
            <span>v{{ updateState.currentVersion }}</span>
            <span v-if="hasUpdate"> · 有新版 v{{ updateState.latest.version }}</span>
          </button>
        </div>
        <span class="sync-status" id="sync-status" :title="syncState.lastError || ''">
          <i class="sync-dot" :class="syncDotClass" aria-hidden="true"></i>{{ syncText }}
        </span>
        <span v-if="!desktop" id="data-hint" class="data-hint"
          >数据仅存于本机浏览器，清除浏览器数据会丢失。建议开启同步或定期导出。</span
        >
        本地存储 · JSON 可导出<br />
        <kbd>N</kbd> 新建 · <kbd>/</kbd> 搜索 · <kbd>Esc</kbd> 关闭
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ProjectList from './ProjectList.vue';
import BrandMark from './BrandMark.vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { useTransfer } from '../composables/useTransfer.js';
import { useUpdateCheck } from '../composables/useUpdateCheck.js';
import { updateState } from '../store/update.js';
import { isTauri } from '../lib/tauri.js';
import { syncState, syncStatusText } from '../store/sync.js';
import { navCounts, projectStats } from '../core/filters.js';

const tasks = useTaskStore();
const ui = useUiStore();
const router = useRouter();
const { doExport, importFile } = useTransfer();
const { checkNow } = useUpdateCheck();
const desktop = isTauri();

const hasUpdate = computed(() => updateState.status === 'available' && !!updateState.latest);
const checkLabel = computed(() => (updateState.status === 'checking' ? '检查中…' : '检查更新'));

const syncText = computed(() => syncStatusText());
const syncDotClass = computed(() => {
  if (!syncState.configured) return '';
  if (syncState.status === 'syncing') return 'syncing';
  if (syncState.status === 'ok') return 'ok';
  return 'error';
});

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

function openImport() {
  const input = document.getElementById('import-file');
  if (input) input.click();
}

function openBackup() {
  ui.openBackupModal(document.getElementById('btn-backup'));
}

function openSync() {
  ui.openSyncModal(document.getElementById('btn-sync-settings'));
}

function checkUpdate() {
  checkNow(document.getElementById('btn-check-update'));
}

function versionClick() {
  if (hasUpdate.value) ui.openUpdateModal(document.getElementById('app-version'));
  else checkNow(document.getElementById('app-version'));
}

function onImportFile(e) {
  importFile(e.target.files && e.target.files[0]);
  e.target.value = '';
}
</script>
