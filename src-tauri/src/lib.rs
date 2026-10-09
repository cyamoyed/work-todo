use std::fs;
use std::path::PathBuf;
use tauri::Manager;

fn tasks_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("create data dir: {e}"))?;
    Ok(dir.join("tasks.json"))
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
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_tasks, save_tasks, notify_overdue])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
