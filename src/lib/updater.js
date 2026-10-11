/* work-todo — in-app updater over plugin:updater / plugin:process (desktop only) */

import { isTauri, tauriInvoke } from './tauri.js';

/**
 * Build a Tauri IPC channel for streaming download progress, mirroring
 * @tauri-apps/api's Channel: transformCallback registers a JS handler, and the
 * magic `__CHANNEL__:<id>` string is what the IPC layer deserializes back into
 * the Rust-side channel handle.
 */
function makeChannel(onEvent) {
  const t = typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__);
  const transform = t && typeof t.transformCallback === 'function' ? t.transformCallback : null;
  if (!transform) throw new Error('updater channel unavailable');
  return `__CHANNEL__:${transform(onEvent)}`;
}

/** True when running inside the Tauri shell (web builds have no updater). */
export function isUpdaterSupported() {
  return isTauri();
}

/**
 * Ask plugin:updater for the newest installable update. The plugin's `check`
 * command resolves null when there is no update, or a Metadata object
 * { currentVersion, version, date, body, rawJson, rid } — availability is
 * implied by the response being non-null (the plugin never sends an
 * `available` field; see tauri-plugin-updater commands.rs). We normalize to
 * { available, version, body, rid } for the store, or null when unavailable
 * (web build / plugin error / endpoint without latest.json yet).
 */
export function nativeUpdaterCheck() {
  if (!isTauri()) return Promise.resolve(null);
  return tauriInvoke('plugin:updater|check', {})
    .then((raw) =>
      raw && typeof raw === 'object' && raw.rid !== undefined
        ? { available: true, version: raw.version || '', body: raw.body || '', rid: raw.rid }
        : { available: false }
    )
    .catch(() => null);
}

/**
 * Download and install the update checked by `rid`. `onEvent` receives the
 * plugin's download events (Started / Progress / Finished — see
 * core/update.js createDownloadProgress). On Windows the process exits when
 * the installer takes over (the promise never resolves); on macOS/Linux the
 * promise resolves after install and the caller can relaunch.
 */
export function nativeDownloadAndInstall(rid, onEvent) {
  return tauriInvoke('plugin:updater|download_and_install', {
    rid,
    onEvent: makeChannel(onEvent),
  });
}

/** Relaunch the app after an in-place update (macOS / Linux). */
export function nativeRelaunch() {
  return tauriInvoke('plugin:process|restart', { exitCode: 0 });
}
