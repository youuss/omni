use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const EXCLUDED_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", ".next", "__pycache__"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<DirEntry>>,
}

fn should_exclude(name: &str) -> bool {
    EXCLUDED_DIRS.contains(&name)
}

fn scan_dir_recursive(path: &Path, current_depth: u32, max_depth: u32) -> Result<Vec<DirEntry>, String> {
    if current_depth >= max_depth {
        return Ok(vec![]);
    }

    let mut entries = Vec::new();
    let read_dir = fs::read_dir(path).map_err(|e| e.to_string())?;

    for item in read_dir {
        let item = item.map_err(|e| e.to_string())?;
        let item_path = item.path();
        let name = item.file_name().to_string_lossy().into_owned();

        if should_exclude(&name) {
            continue;
        }

        let path_str = item_path.to_string_lossy().into_owned();
        let is_dir = item_path.is_dir();

        let children = if is_dir && current_depth + 1 < max_depth {
            Some(scan_dir_recursive(&item_path, current_depth + 1, max_depth)?)
        } else {
            None
        };

        entries.push(DirEntry {
            name,
            path: path_str,
            is_dir,
            children,
        });
    }

    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn scan_directory(path: String, max_depth: u32) -> Result<DirEntry, String> {
    let root = Path::new(&path);
    if !root.exists() {
        return Err("Path does not exist".to_string());
    }
    if !root.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let name = root
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let path_str = root.to_string_lossy().into_owned();

    let children = if max_depth > 0 {
        Some(scan_dir_recursive(root, 0, max_depth)?)
    } else {
        None
    };

    Ok(DirEntry {
        name,
        path: path_str,
        is_dir: true,
        children,
    })
}
