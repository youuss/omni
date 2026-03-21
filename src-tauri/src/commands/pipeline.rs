use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

fn pipeline_path(project_path: &str) -> String {
    Path::new(project_path)
        .join(".omni")
        .join("pipeline.json")
        .to_string_lossy()
        .into_owned()
}

fn templates_dir(project_path: &str) -> std::path::PathBuf {
    Path::new(project_path).join(".omni").join("pipelines")
}

#[tauri::command]
pub fn read_project_pipeline(project_path: String) -> Result<String, String> {
    let p = pipeline_path(&project_path);
    match fs::read_to_string(&p) {
        Ok(content) => Ok(content),
        Err(_) => Ok(String::new()),
    }
}

#[tauri::command]
pub fn write_project_pipeline(project_path: String, content: String) -> Result<(), String> {
    let p = pipeline_path(&project_path);
    if let Some(parent) = Path::new(&p).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&p, content).map_err(|e| e.to_string())
}

// ── Pipeline Templates ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineTemplateInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub builtin: bool,
}

#[tauri::command]
pub fn list_pipeline_templates(project_path: String) -> Result<Vec<PipelineTemplateInfo>, String> {
    let dir = templates_dir(&project_path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let id = path.file_stem().unwrap_or_default().to_string_lossy().into_owned();
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

        // Parse just enough to get name/description
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            result.push(PipelineTemplateInfo {
                id,
                name: val["name"].as_str().unwrap_or("").to_string(),
                description: val["description"].as_str().unwrap_or("").to_string(),
                builtin: val["builtin"].as_bool().unwrap_or(false),
            });
        }
    }
    result.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(result)
}

#[tauri::command]
pub fn read_pipeline_template(project_path: String, template_id: String) -> Result<String, String> {
    let path = templates_dir(&project_path).join(format!("{}.json", template_id));
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_pipeline_template(
    project_path: String,
    template_id: String,
    content: String,
) -> Result<(), String> {
    let dir = templates_dir(&project_path);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{}.json", template_id)), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_pipeline_template(project_path: String, template_id: String) -> Result<(), String> {
    let path = templates_dir(&project_path).join(format!("{}.json", template_id));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
