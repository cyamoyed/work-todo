/* WorkTodo — shared export/import flows (SideNav + MobileDrawer) */

import { useTaskStore } from '../store/tasks.js';
import { useUiStore } from '../store/ui.js';
import { parseImportPayload, exportFilename } from '../core/transfer.js';
import { createBackupNow } from '../lib/backup.js';

export function downloadExportFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useTransfer() {
  const tasks = useTaskStore();
  const ui = useUiStore();

  function doExport() {
    downloadExportFile(tasks.exportPayload(), exportFilename());
    ui.showToast('已导出数据');
  }

  function importText(text) {
    const result = parseImportPayload(text);
    if (!result.ok) {
      ui.showToast('导入失败：' + result.error);
      return;
    }
    ui.openConfirmCustom(
      `将导入 ${result.tasks.length} 条任务、${result.projects.length} 个项目。按合并策略写入当前数据。`,
      () => {
        const res = tasks.importPayload({ tasks: result.tasks, projects: result.projects }, 'merge');
        ui.showToast(`导入完成：新增 ${res.added} · 更新 ${res.updated}`);
        // Keep a pre-import recovery point on desktop (best-effort).
        createBackupNow(tasks.exportPayload());
      }
    );
  }

  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importText(String(reader.result));
    reader.readAsText(file);
  }

  return { doExport, importFile, importText };
}
