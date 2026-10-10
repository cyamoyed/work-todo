<template>
  <div id="backup-backdrop" class="modal-backdrop" :hidden="!ui.state.backupModalOpen" @click.self="close">
    <div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="backup-modal-title">
      <div class="modal-header">
        <h2 id="backup-modal-title">数据备份</h2>
        <button type="button" class="modal-close" id="btn-close-backup" aria-label="关闭" @click="close">✕</button>
      </div>
      <p id="backup-hint">备份保存在应用数据目录，自动保留最近 10 份。恢复备份会替换当前数据。</p>
      <ul class="backup-list" id="backup-list">
        <li v-for="b in backups" :key="b.name" class="backup-row">
          <span class="backup-name">{{ formatWhen(b.modified) }}</span>
          <span class="backup-size">{{ formatSize(b.size) }}</span>
          <button
            type="button"
            class="btn btn-ghost btn-sm backup-restore"
            :data-name="b.name"
            @click="restore(b)"
          >恢复</button>
        </li>
      </ul>
      <p v-if="!backups.length" class="backup-empty" id="backup-empty">暂无备份。</p>
      <div class="modal-actions">
        <button type="button" id="btn-backup-now" class="btn btn-ghost" @click="backupNow">立即备份</button>
        <button type="button" id="btn-close-backup-actions" class="btn btn-primary" @click="close">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { parseImportPayload } from '../core/transfer.js';
import { createBackupNow, listBackupFiles, readBackupPayload } from '../lib/backup.js';

const tasks = useTaskStore();
const ui = useUiStore();

const backups = ref([]);

watch(
  () => ui.state.backupModalOpen,
  (open) => {
    if (!open) return;
    refresh();
  }
);

async function refresh() {
  backups.value = await listBackupFiles();
}

function formatWhen(secs) {
  const d = new Date((secs || 0) * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function formatSize(bytes) {
  if (!bytes) return '0 KB';
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function backupNow() {
  const name = await createBackupNow(tasks.exportPayload());
  if (name) ui.showToast('已创建备份');
  else ui.showToast('备份失败');
  refresh();
}

function restore(b) {
  ui.openConfirmCustom(
    `将用「${formatWhen(b.modified)}」的备份替换当前数据。继续吗？`,
    async () => {
      const payload = await readBackupPayload(b.name);
      if (!payload) {
        ui.showToast('备份文件读取失败');
        return;
      }
      const parsed = parseImportPayload(payload);
      if (!parsed.ok) {
        ui.showToast('备份文件无效：' + parsed.error);
        return;
      }
      tasks.importPayload({ tasks: parsed.tasks, projects: parsed.projects }, 'replace');
      ui.showToast('已从备份恢复数据');
      close();
    }
  );
}

function close() {
  ui.closeBackupModal();
}
</script>
