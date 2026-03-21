use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    pub is_git: bool,
    pub has_specs: bool,
    pub active_changes: Vec<String>,
    pub last_opened: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedProject {
    path: String,
    name: String,
}

fn projects_json_path() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "无法获取用户主目录")?;
    let config_dir = Path::new(&home).join(".omni");
    Ok(config_dir.join("projects.json"))
}

fn ensure_config_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "无法获取用户主目录")?;
    let config_dir = Path::new(&home).join(".omni");
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    Ok(config_dir)
}

fn load_projects_json() -> Result<Vec<SavedProject>, String> {
    let path = projects_json_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let projects: Vec<SavedProject> = serde_json::from_str(&content).unwrap_or_default();
    Ok(projects)
}

fn save_projects_json(projects: &[SavedProject]) -> Result<(), String> {
    ensure_config_dir()?;
    let path = projects_json_path()?;
    let content = serde_json::to_string_pretty(projects).map_err(|e| e.to_string())?;
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_project(path: String) -> Result<ProjectInfo, String> {
    let project_path = Path::new(&path);
    if !project_path.exists() {
        return Err("路径不存在".to_string());
    }
    if !project_path.is_dir() {
        return Err("路径不是目录".to_string());
    }

    let is_git = project_path.join(".git").exists();
    let specs_dir = project_path.join(".specs");
    let has_specs = specs_dir.exists() && specs_dir.is_dir();

    let active_changes: Vec<String> = if has_specs {
        let active_dir = specs_dir.join("active");
        if active_dir.exists() {
            fs::read_dir(&active_dir)
                .map_err(|e| e.to_string())?
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    let saved = load_projects_json()?;
    let name = saved
        .iter()
        .find(|p| {
            Path::new(&p.path).canonicalize().ok()
                == project_path.canonicalize().ok()
        })
        .map(|p| p.name.clone())
        .unwrap_or_else(|| project_path.file_name().unwrap_or_default().to_string_lossy().into_owned());

    let last_opened = chrono::Utc::now().to_rfc3339();

    Ok(ProjectInfo {
        path: path.clone(),
        name,
        is_git,
        has_specs,
        active_changes,
        last_opened,
    })
}

#[tauri::command]
pub fn list_projects() -> Result<Vec<ProjectInfo>, String> {
    let saved = load_projects_json()?;
    let mut result = Vec::new();
    for p in saved {
        if let Ok(info) = open_project(p.path.clone()) {
            result.push(info);
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn add_project(path: String, name: String) -> Result<(), String> {
    let mut projects = load_projects_json()?;
    let canonical = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;
    let path_str = canonical.to_string_lossy().into_owned();

    projects.retain(|p| {
        Path::new(&p.path).canonicalize().ok() != Some(canonical.clone())
    });
    projects.push(SavedProject {
        path: path_str,
        name,
    });
    save_projects_json(&projects)
}

#[tauri::command]
pub fn remove_project(path: String) -> Result<(), String> {
    let mut projects = load_projects_json()?;
    let canonical = Path::new(&path).canonicalize().map_err(|e| e.to_string())?;

    projects.retain(|p| Path::new(&p.path).canonicalize().ok() != Some(canonical.clone()));
    save_projects_json(&projects)
}
