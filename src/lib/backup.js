/* WorkTodo — desktop rolling backups over the Tauri bridge (best-effort) */

import { isTauri, backupTasks, listBackups, restoreBackup } from './tauri.js';
import { backupFilename } from '../core/transfer.js';

export function isBackupAvailable() {
  return isTauri();
}

/** Persist a rolling backup of the full export payload. Returns the name or null. */
export function createBackupNow(payload) {
  if (!isTauri()) return Promise.resolve(null);
  try {
    return backupTasks(JSON.stringify(payload), backupFilename());
  } catch (_) {
    return Promise.resolve(null);
  }
}

/** Backup files, newest first. */
export function listBackupFiles() {
  return listBackups();
}

/** Read one backup and parse its payload. Returns the payload object or null. */
export function readBackupPayload(name) {
  return restoreBackup(name).then((raw) => {
    if (typeof raw !== 'string' || !raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  });
}
