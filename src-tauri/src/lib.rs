use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TreeEntry {
    kind: String,
    name: String,
    path: String,
    editable: bool,
    children: Vec<TreeEntry>,
}

fn is_editable(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "md" | "markdown" | "txt"
            )
        })
        .unwrap_or(false)
}

fn path_string(path: PathBuf) -> String {
    path.to_string_lossy().into_owned()
}

fn read_tree(path: &Path) -> Result<Vec<TreeEntry>, String> {
    let mut entries = fs::read_dir(path)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            let file_type = entry.file_type().ok()?;

            if file_type.is_dir() {
                Some(TreeEntry {
                    kind: "directory".into(),
                    name,
                    path: path_string(path.clone()),
                    editable: false,
                    children: read_tree(&path).unwrap_or_default(),
                })
            } else if file_type.is_file() {
                Some(TreeEntry {
                    kind: "file".into(),
                    name,
                    path: path_string(path.clone()),
                    editable: is_editable(&path),
                    children: Vec::new(),
                })
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| {
        let left_directory = left.kind == "directory";
        let right_directory = right.kind == "directory";
        right_directory
            .cmp(&left_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
fn choose_folder() -> Option<String> {
    rfd::FileDialog::new().pick_folder().map(path_string)
}

#[tauri::command]
fn choose_file() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .pick_file()
        .map(path_string)
}

#[tauri::command]
fn list_directory(path: String) -> Result<Vec<TreeEntry>, String> {
    read_tree(Path::new(&path))
}

#[tauri::command]
fn set_window_title(window: WebviewWindow, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|error| error.to_string())
}

struct DirtyState(Mutex<bool>);

#[tauri::command]
fn close_window(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    let _ = window.destroy();
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn set_dirty_state(state: tauri::State<'_, DirtyState>, dirty: bool) -> Result<(), String> {
    let mut current = state.0.lock().map_err(|error| error.to_string())?;
    *current = dirty;
    Ok(())
}

#[tauri::command]
fn choose_new_file_path(default_name: String) -> Option<String> {
    let final_name = if is_editable(Path::new(&default_name)) {
        default_name
    } else {
        format!("{default_name}.md")
    };

    rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .set_file_name(&final_name)
        .save_file()
        .map(path_string)
}

#[tauri::command]
fn path_kind(path: String) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.is_dir() {
        Ok("directory".into())
    } else if metadata.is_file() {
        Ok("file".into())
    } else {
        Ok("other".into())
    }
}

#[tauri::command]
fn startup_paths() -> Vec<String> {
    std::env::args()
        .skip(1)
        .map(PathBuf::from)
        .filter(|path| path.exists())
        .map(path_string)
        .collect()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|error| error.to_string())
}

fn image_mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn read_image_as_data_url(document_path: String, src: String) -> Result<String, String> {
    let src_path = PathBuf::from(&src);
    let image_path = if src_path.is_absolute() {
        src_path
    } else {
        Path::new(&document_path)
            .parent()
            .ok_or_else(|| "Document path has no parent directory".to_string())?
            .join(src_path)
    };
    let bytes = fs::read(&image_path).map_err(|error| error.to_string())?;
    let encoded = general_purpose::STANDARD.encode(bytes);
    Ok(format!(
        "data:{};base64,{}",
        image_mime_type(&image_path),
        encoded
    ))
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Only http and https URLs can be opened".into());
    }

    #[cfg(target_os = "windows")]
    let status = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", &url])
        .status()
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .arg(&url)
        .status()
        .map_err(|error| error.to_string())?;

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(&url)
        .status()
        .map_err(|error| error.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to open URL: {status}"))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DirtyState(Mutex::new(false)))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let is_dirty = window
                    .state::<DirtyState>()
                    .0
                    .lock()
                    .map(|dirty| *dirty)
                    .unwrap_or(false);

                if !is_dirty {
                    api.prevent_close();
                    let _ = window.destroy();
                    window.app_handle().exit(0);
                    return;
                }

                api.prevent_close();
                let result = rfd::MessageDialog::new()
                    .set_level(rfd::MessageLevel::Warning)
                    .set_title("保存更改？")
                    .set_description("当前文件有未保存的修改，关闭前要保存吗？")
                    .set_buttons(rfd::MessageButtons::YesNoCancelCustom(
                        "保存".into(),
                        "不保存".into(),
                        "取消".into(),
                    ))
                    .show();

                match result {
                    rfd::MessageDialogResult::Custom(action) if action == "保存" => {
                        let _ = window.emit("request-save-and-close", ());
                    }
                    rfd::MessageDialogResult::Custom(action) if action == "不保存" => {
                        if let Ok(mut dirty) = window.state::<DirtyState>().0.lock() {
                            *dirty = false;
                        }
                        let _ = window.destroy();
                        window.app_handle().exit(0);
                    }
                    _ => {}
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            choose_folder,
            choose_file,
            list_directory,
            set_window_title,
            close_window,
            set_dirty_state,
            choose_new_file_path,
            path_kind,
            startup_paths,
            read_text_file,
            write_text_file,
            read_image_as_data_url,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mojian");
}
