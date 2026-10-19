use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

const BACKUP_PREFIX: &str = "work-todo-";
const BACKUP_KEEP: usize = 10;

fn tasks_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create data dir: {e}"))?;
    Ok(dir.join("tasks.json"))
}

fn backups_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?
        .join("backups");
    fs::create_dir_all(&dir).map_err(|e| format!("create backups dir: {e}"))?;
    Ok(dir)
}

/// Backup names come from the frontend timestamp helper; keep them inert.
fn sanitize_backup_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || !trimmed.ends_with(".json") || trimmed.contains("..") {
        return Err(format!("invalid backup name: {name}"));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err(format!("invalid backup name: {name}"));
    }
    Ok(trimmed.to_string())
}

fn list_backup_names(dir: &Path) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| format!("read backups dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read backups entry: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(BACKUP_PREFIX) && name.ends_with(".json") {
            names.push(name);
        }
    }
    Ok(names)
}

/// Keep only the newest BACKUP_KEEP backups (names sort chronologically).
fn prune_backups(dir: &Path) -> Result<(), String> {
    let mut names = list_backup_names(dir)?;
    names.sort();
    while names.len() > BACKUP_KEEP {
        let oldest = names.remove(0);
        let _ = fs::remove_file(dir.join(oldest));
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct BackupInfo {
    name: String,
    size: u64,
    modified: u64, // unix seconds
}

#[tauri::command]
fn load_tasks(app: tauri::AppHandle) -> Result<String, String> {
    let path = tasks_path(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(&path).map_err(|e| format!("read tasks: {e}"))
}

#[tauri::command]
fn save_tasks(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = tasks_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data.as_bytes()).map_err(|e| format!("write tasks: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("replace tasks: {e}"))?;
    Ok(())
}

#[tauri::command]
fn backup_tasks(app: tauri::AppHandle, data: String, name: String) -> Result<String, String> {
    let name = sanitize_backup_name(&name)?;
    let dir = backups_dir(&app)?;
    let path = dir.join(&name);
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data.as_bytes()).map_err(|e| format!("write backup: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("replace backup: {e}"))?;
    prune_backups(&dir)?;
    Ok(name)
}

#[tauri::command]
fn list_backups(app: tauri::AppHandle) -> Result<Vec<BackupInfo>, String> {
    let dir = backups_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read backups dir: {e}"))? {
        let entry = entry.map_err(|e| format!("read backups entry: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(BACKUP_PREFIX) || !name.ends_with(".json") {
            continue;
        }
        let meta = entry.metadata().map_err(|e| format!("backup metadata: {e}"))?;
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        out.push(BackupInfo {
            name,
            size: meta.len(),
            modified,
        });
    }
    out.sort_by(|a, b| b.name.cmp(&a.name)); // newest first
    Ok(out)
}

#[tauri::command]
fn restore_backup(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let name = sanitize_backup_name(&name)?;
    let path = backups_dir(&app)?.join(&name);
    if !path.exists() {
        return Err(format!("backup not found: {name}"));
    }
    fs::read_to_string(&path).map_err(|e| format!("read backup: {e}"))
}

#[tauri::command]
fn notify_overdue(title: String, body: String) -> Result<(), String> {
    // Best-effort desktop toast via PowerShell / osascript is too heavy;
    // the WebView Notification API is used from JS. This command is a
    // stable extension point for a future native notification plugin.
    let _ = (title, body);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be registered first so a second launch exits before
        // any other plugin or the webview starts.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // Bring the existing window to the front (unminimize first,
            // otherwise set_focus alone can leave it hidden on Windows).
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            load_tasks,
            save_tasks,
            backup_tasks,
            list_backups,
            restore_backup,
            notify_overdue
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
