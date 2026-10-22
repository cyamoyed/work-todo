<template>
  <div id="settings-backdrop" class="modal-backdrop" :hidden="!ui.state.settingsModalOpen" @click.self="close">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <div class="modal-header">
        <h2 id="settings-modal-title">设置</h2>
        <button type="button" class="modal-close" id="btn-close-settings" aria-label="关闭" @click="close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <div class="settings-body">
        <section class="settings-sec" aria-label="外观">
      <h4 class="settings-sec-title">外观</h4>
      <div class="settings-row">
        <div class="settings-row-main">
          <span class="settings-label">主题</span>
          <span class="settings-desc">跟随系统、浅色或深色,立即生效</span>
        </div>
        <ThemeToggle :labels="true" />
      </div>
    </section>

    <section v-if="desktop" class="settings-sec" aria-label="通用">
      <h4 class="settings-sec-title">通用</h4>
      <div class="settings-row">
        <div class="settings-row-main">
          <span class="settings-label">开机自动启动</span>
          <span class="settings-desc">登录系统后自动打开工作待办</span>
        </div>
        <button
          type="button"
          id="btn-autostart"
          class="btn sm"
          :aria-pressed="autostartOn"
          :disabled="autostartBusy"
          @click="toggleAutostart"
        >{{ autostartLabel }}</button>
      </div>
    </section>

    <section class="settings-sec" aria-label="数据">
      <h4 class="settings-sec-title">数据</h4>
      <div class="settings-row">
        <div class="settings-row-main">
          <span class="settings-label">导出数据</span>
          <span class="settings-desc">下载全部任务与项目的 JSON 文件</span>
        </div>
        <button type="button" id="btn-export" class="btn sm" @click="doExport">导出</button>
      </div>
      <div class="settings-row">
        <div class="settings-row-main">
          <span class="settings-label">导入数据</span>
          <span class="settings-desc">从 JSON 文件导入,与现有数据按条目合并</span>
        </div>
        <button type="button" id="btn-import" class="btn sm" @click="triggerImport">导入</button>
      </div>
      <div v-if="desktop" class="settings-row">
        <div class="settings-row-main">
          <span class="settings-label">数据备份</span>
          <span class="settings-desc">桌面端本地滚动备份,保留最近 10 份</span>
        </div>
        <button type="button" id="btn-backup" class="btn sm" @click="openBackup">管理</button>
      </div>
    </section>

    <section class="settings-sec" aria-label="同步">
      <h4 class="settings-sec-title">同步</h4>
      <div class="settings-row">
        <div class="settings-row-main">
          <span class="settings-label">多设备同步</span>
          <span class="sync-status" id="sync-status" :title="syncState.lastError || ''">
            <i class="sync-dot" :class="syncDotClass" aria-hidden="true"></i>{{ syncText }}
          </span>
        </div>
        <button type="button" id="btn-sync-settings" class="btn sm" @click="openSync">配置</button>
      </div>
    </section>

    <section class="settings-sec" aria-label="关于">
      <h4 class="settings-sec-title">关于</h4>
      <div class="settings-row">
        <div class="settings-row-main">
          <span class="settings-label">当前版本</span>
          <button
            type="button"
            id="app-version"
            class="settings-version"
            :class="{ 'has-update': hasUpdate }"
            :title="hasUpdate ? '发现新版本,点击查看' : '当前版本,点击检查更新'"
            @click="versionClick"
          >
            <i v-if="hasUpdate" class="version-dot" aria-hidden="true"></i>
            <span>v{{ updateState.currentVersion }}</span>
            <span v-if="hasUpdate"> · 有新版 v{{ updateState.latest.version }}</span>
          </button>
        </div>
        <button
          type="button"
          id="btn-check-update"
          class="btn sm"
          :disabled="updateState.status === 'checking'"
          @click="checkUpdate"
        >{{ checkLabel }}</button>
      </div>
    </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import ThemeToggle from '../components/ThemeToggle.vue';
import { useUiStore } from '../store/ui.js';
import { useUpdateCheck } from '../composables/useUpdateCheck.js';
import { useTransfer } from '../composables/useTransfer.js';
import { updateState } from '../store/update.js';
import { isTauri, isAutostartEnabled, setAutostart } from '../lib/tauri.js';
import { syncState, syncStatusText } from '../store/sync.js';

const ui = useUiStore();
const { doExport } = useTransfer();
const { checkNow } = useUpdateCheck();
const desktop = isTauri();

/* —— 开机自启动：状态存在 OS（注册表 / LaunchAgent），这里只读写它 —— */
const autostartOn = ref(false);
const autostartBusy = ref(false);
const autostartLabel = computed(() => {
  if (autostartBusy.value) return '处理中…';
  return autostartOn.value ? '已开启' : '已关闭';
});

if (desktop) isAutostartEnabled().then((on) => { autostartOn.value = on; });

async function toggleAutostart() {
  if (autostartBusy.value) return;
  autostartBusy.value = true;
  const target = !autostartOn.value;
  await setAutostart(target);
  // Re-read the real OS state — the toggle may have been refused (e.g. Linux
  // without an installed .desktop entry).
  autostartOn.value = await isAutostartEnabled();
  autostartBusy.value = false;
  if (autostartOn.value !== target) ui.showToast('设置开机自启动失败');
}

function close() {
  ui.closeSettingsModal();
}

const hasUpdate = computed(() => updateState.status === 'available' && !!updateState.latest);
const checkLabel = computed(() => (updateState.status === 'checking' ? '检查中…' : '检查更新'));

const syncText = computed(() => syncStatusText());
const syncDotClass = computed(() => {
  if (!syncState.configured) return '';
  if (syncState.status === 'syncing') return 'syncing';
  if (syncState.status === 'ok') return 'ok';
  return 'error';
});

function triggerImport() {
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
</script>
