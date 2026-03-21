use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangeInfo {
    pub name: String,
    pub files: Vec<String>,
    pub has_requirements: bool,
    pub has_dev_plan: bool,
    pub has_verification: bool,
    pub created_at: Option<String>,
}

fn read_dir_files(dir: &Path) -> Result<Vec<String>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    Ok(fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect())
}

#[tauri::command]
pub fn list_active_changes(project_path: String) -> Result<Vec<ChangeInfo>, String> {
    let active_dir = Path::new(&project_path).join(".specs").join("active");
    if !active_dir.exists() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    for entry in fs::read_dir(&active_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let files = read_dir_files(&path)?;
        let has_requirements = files.iter().any(|f| f.contains("requirement") || f.ends_with("-req.md"));
        let has_dev_plan = files.iter().any(|f| f.contains("dev-plan") || f.contains("plan"));
        let has_verification = files.iter().any(|f| f.contains("verification") || f.contains("verify"));

        let created_at = entry.metadata()
            .ok()
            .and_then(|m| m.created().ok())
            .and_then(|t| {
                chrono::DateTime::from_timestamp(
                    t.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs() as i64,
                    0,
                )
                .map(|dt| dt.to_rfc3339())
            });

        result.push(ChangeInfo {
            name,
            files,
            has_requirements,
            has_dev_plan,
            has_verification,
            created_at,
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn create_change(project_path: String, name: String) -> Result<(), String> {
    let change_dir = Path::new(&project_path).join(".specs").join("active").join(&name);
    fs::create_dir_all(&change_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(change_dir.join("images")).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn read_change_file(
    project_path: String,
    change_name: String,
    file_name: String,
) -> Result<String, String> {
    let file_path = Path::new(&project_path)
        .join(".specs")
        .join("active")
        .join(&change_name)
        .join(&file_name);
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_change_file(
    project_path: String,
    change_name: String,
    file_name: String,
    content: String,
) -> Result<(), String> {
    let file_path = Path::new(&project_path)
        .join(".specs")
        .join("active")
        .join(&change_name)
        .join(&file_name);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&file_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_change(project_path: String, change_name: String) -> Result<(), String> {
    let change_dir = Path::new(&project_path)
        .join(".specs")
        .join("active")
        .join(&change_name);
    if !change_dir.exists() {
        return Err(format!("变更目录不存在: {}", change_name));
    }
    fs::remove_dir_all(&change_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_change(project_path: String, change_name: String) -> Result<(), String> {
    let project = Path::new(&project_path);
    let active_dir = project.join(".specs").join("active");
    let archive_dir = project.join(".specs").join("archive");
    let src = active_dir.join(&change_name);
    let date_prefix = chrono::Utc::now().format("%Y-%m-%d");
    let dest = archive_dir.join(format!("{}-{}", date_prefix, change_name));

    if !src.exists() {
        return Err(format!("变更目录不存在: {}", change_name));
    }
    fs::create_dir_all(&archive_dir).map_err(|e| e.to_string())?;
    fs::rename(&src, &dest).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveInfo {
    pub name: String,
    pub original_name: String,
    pub date: String,
    pub files: Vec<String>,
}

#[tauri::command]
pub fn list_archived_changes(project_path: String) -> Result<Vec<ArchiveInfo>, String> {
    let archive_dir = Path::new(&project_path).join(".specs").join("archive");
    if !archive_dir.exists() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    for entry in fs::read_dir(&archive_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let files = read_dir_files(&path)?;

        let (date, original_name) = if name.len() > 11 && &name[4..5] == "-" && &name[7..8] == "-" {
            (name[..10].to_string(), name[11..].to_string())
        } else {
            (String::new(), name.clone())
        };

        result.push(ArchiveInfo {
            name: name.clone(),
            original_name,
            date,
            files,
        });
    }
    result.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(result)
}

#[tauri::command]
pub fn read_archive_file(
    project_path: String,
    archive_name: String,
    file_name: String,
) -> Result<String, String> {
    let file_path = Path::new(&project_path)
        .join(".specs")
        .join("archive")
        .join(&archive_name)
        .join(&file_name);
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_domains(project_path: String) -> Result<Vec<String>, String> {
    let domains_dir = Path::new(&project_path).join(".specs").join("domains");
    if !domains_dir.exists() {
        return Ok(vec![]);
    }

    Ok(fs::read_dir(&domains_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .collect())
}
