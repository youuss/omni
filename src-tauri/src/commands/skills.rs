use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub id: String,
    pub path: String,
    pub name: String,
    pub description: String,
}

/// 从 SKILL.md 的 YAML front matter 提取 name / description
fn parse_front_matter(content: &str) -> (String, String) {
    let mut name = String::new();
    let mut description = String::new();

    let content = content.trim_start();
    if !content.starts_with("---") {
        return (name, description);
    }

    let rest = &content[3..];
    let end = match rest.find("\n---") {
        Some(i) => i,
        None => return (name, description),
    };

    for line in rest[..end].lines() {
        if let Some(val) = line.strip_prefix("name:") {
            name = val.trim().to_string();
        } else if let Some(val) = line.strip_prefix("description:") {
            description = val.trim().to_string();
        }
    }

    (name, description)
}

#[tauri::command]
pub fn scan_skills(project_path: String) -> Result<Vec<SkillInfo>, String> {
    let skills_dir = Path::new(&project_path).join(".claude").join("skills");

    if !skills_dir.exists() {
        return Ok(vec![]);
    }

    let mut skills = Vec::new();

    for entry in fs::read_dir(&skills_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        let skill_file = path.join("SKILL.md");
        if !skill_file.exists() {
            continue;
        }

        let id = entry.file_name().to_string_lossy().into_owned();
        let skill_path = skill_file.to_string_lossy().into_owned();

        let (parsed_name, description) = fs::read_to_string(&skill_file)
            .map(|content| parse_front_matter(&content))
            .unwrap_or_default();

        let name = if parsed_name.is_empty() { id.clone() } else { parsed_name };

        skills.push(SkillInfo { id, path: skill_path, name, description });
    }

    skills.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(skills)
}

#[tauri::command]
pub fn write_skill_file(project_path: String, skill_id: String, content: String) -> Result<(), String> {
    let skill_dir = Path::new(&project_path)
        .join(".claude")
        .join("skills")
        .join(&skill_id);
    fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    fs::write(skill_dir.join("SKILL.md"), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_skill(project_path: String, skill_id: String) -> Result<(), String> {
    let skill_dir = Path::new(&project_path)
        .join(".claude")
        .join("skills")
        .join(&skill_id);
    if skill_dir.exists() {
        fs::remove_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
