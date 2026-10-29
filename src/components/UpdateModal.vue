<template>
  <div id="update-backdrop" class="modal-backdrop" :hidden="!ui.state.updateModalOpen" @click.self="close">
    <div id="update-modal" class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="update-modal-title">
      <div class="modal-header">
        <h2 id="update-modal-title">发现新版本 v{{ latest.version }}</h2>
        <button type="button" class="modal-close" id="btn-close-update" aria-label="关闭" @click="close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <p id="update-meta">
        当前版本 v{{ updateState.currentVersion }}<span v-if="publishedText"> · 发布于 {{ publishedText }}</span>
      </p>

      <p v-if="updateState.stale" id="update-stale-hint" class="update-hint">
        GitHub 暂时请求受限，以上版本信息来自上次检查
      </p>

      <div v-if="latest.notes" id="update-notes" class="update-notes">{{ latest.notes }}</div>

      <p v-if="!isDesktop" class="update-hint">网页版部署更新后，刷新页面即可使用新版</p>

      <div v-if="installing" id="update-install" class="update-install" aria-live="polite">
        <template v-if="native.status === 'downloading'">
          <div class="update-progress" :data-percent="native.percent ?? ''">
            <div class="update-progress-fill" :style="{ width: (native.percent ?? 0) + '%' }"></div>
          </div>
          <p class="update-install-status">
            {{ native.percent !== null ? `下载中 ${native.percent}%` : `下载中 · 已下载 ${receivedText}` }}
          </p>
        </template>
        <p v-else-if="native.status === 'installing'" class="update-install-status">正在安装，应用即将重启…</p>
        <p v-else-if="native.status === 'ready'" class="update-install-status">更新已安装，重启后生效</p>
        <p v-else-if="native.status === 'error'" class="update-install-status update-install-error">{{ native.error }}</p>
      </div>

      <div class="modal-actions">
        <button type="button" id="btn-update-later" class="btn btn-ghost" @click="close">稍后</button>
        <template v-if="isDesktop && native.status !== 'ready'">
          <button
            v-if="pendingCheck"
            type="button"
            id="btn-update-checking"
            class="btn btn-primary"
            disabled
          >检测中…</button>
          <button
            v-else-if="installable"
            type="button"
            id="btn-install-update"
            class="btn btn-primary"
            :disabled="busyInstalling"
            @click="install"
          >{{ installLabel }}</button>
          <button v-else type="button" id="btn-open-download" class="btn btn-primary" @click="download">前往下载</button>
        </template>
        <button v-else-if="isDesktop" type="button" id="btn-relaunch" class="btn btn-primary" @click="relaunch">重启应用</button>
        <button v-else type="button" id="btn-open-download" class="btn btn-primary" @click="download">前往下载</button>
        <button
          v-if="native.status !== 'downloading' && native.status !== 'installing'"
          type="button"
          id="btn-copy-link"
          class="btn btn-ghost"
          @click="copyLink"
        >复制链接</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useUiStore } from '../store/ui.js';
import {
  updateState,
  openLatestDownload,
  checkNativeUpdate,
  installNativeUpdate,
  relaunchAfterUpdate,
} from '../store/update.js';
import { copyText } from '../lib/clipboard.js';
import { isTauri } from '../lib/tauri.js';
import { formatBytes } from '../core/update.js';

const ui = useUiStore();
const isDesktop = isTauri();
const native = updateState.native;

const latest = computed(
  () => updateState.latest || { version: updateState.currentVersion, notes: '', url: '', publishedAt: '', downloadUrl: '' }
);

const publishedText = computed(() => {
  const t = latest.value.publishedAt;
  if (!t) return '';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('zh-CN');
});

// The in-app path is usable once the plugin has confirmed an installable
// update (latest.json present + signature verifiable); until then (or when it
// errors out) the browser download stays the primary action.
const installable = computed(() => isDesktop && native.installable && native.status !== 'error');
// First plugin check still in flight: hold a neutral disabled action instead
// of flashing 前往下载 and swapping to 立即更新 once the check resolves.
const pendingCheck = computed(() => isDesktop && !native.checked);
const busyInstalling = computed(() => native.status === 'checking' || native.status === 'downloading' || native.status === 'installing');
const installing = computed(() => isDesktop && native.status !== 'idle' && native.status !== 'checking');
const installLabel = computed(() => {
  if (native.status === 'downloading') return native.percent !== null ? `下载中 ${native.percent}%` : '下载中…';
  if (native.status === 'installing') return '安装中…';
  return '立即更新';
});
const receivedText = computed(() => formatBytes(native.received));

// On desktop, confirm installability every time the dialog opens — a failed
// earlier check (transient network, endpoint without latest.json) must not
// stick for the whole session. Skip while a check or install is in flight,
// when the plugin already confirmed an installable update, or when an
// installed update waits for the relaunch (ready keeps its 重启应用 action).
watch(
  () => ui.state.updateModalOpen,
  (open) => {
    if (!open || !isDesktop) return;
    const busy =
      native.status === 'checking' ||
      native.status === 'downloading' ||
      native.status === 'installing';
    if (busy || native.installable || native.status === 'ready') return;
    checkNativeUpdate();
  }
);

async function install() {
  await installNativeUpdate();
}

function relaunch() {
  relaunchAfterUpdate();
}

async function copyLink() {
  const ok = await copyText(latest.value.downloadUrl || latest.value.url);
  ui.showToast(ok ? '已复制下载链接' : '复制失败，请直接前往下载');
}

function download() {
  openLatestDownload();
  close();
}

function close() {
  ui.closeUpdateModal();
}
</script>
