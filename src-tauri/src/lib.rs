use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            choose_folder,
            choose_file,
            list_directory,
            path_kind,
            startup_paths,
            read_text_file,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Mojian");
}
