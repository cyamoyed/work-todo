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

      <div v-if="latest.notes" id="update-notes" class="update-notes">{{ latest.notes }}</div>

      <p v-if="!isDesktop" class="update-hint">网页版部署更新后，刷新页面即可使用新版</p>

      <div class="modal-actions">
        <button type="button" id="btn-update-later" class="btn btn-ghost" @click="close">稍后</button>
        <button type="button" id="btn-copy-link" class="btn btn-ghost" @click="copyLink">复制链接</button>
        <button type="button" id="btn-open-download" class="btn btn-primary" @click="download">前往下载</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useUiStore } from '../store/ui.js';
import { updateState, openLatestDownload } from '../store/update.js';
import { copyText } from '../lib/clipboard.js';
import { isTauri } from '../lib/tauri.js';

const ui = useUiStore();
const isDesktop = isTauri();

const latest = computed(
  () => updateState.latest || { version: updateState.currentVersion, notes: '', url: '', publishedAt: '', downloadUrl: '' }
);

const publishedText = computed(() => {
  const t = latest.value.publishedAt;
  if (!t) return '';
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('zh-CN');
});

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
