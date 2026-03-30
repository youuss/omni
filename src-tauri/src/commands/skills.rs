use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub source: String, // "global" or "project"
}

fn parse_skill_front_matter(content: &str) -> (String, String) {
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

fn scan_skill_dir(dir: &Path, source: &str) -> Vec<SkillInfo> {
    let mut skills = Vec::new();
    if !dir.exists() {
        return skills;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return skills,
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let skill_file = path.join("SKILL.md");
        if !skill_file.exists() {
            continue;
        }

        let id = entry.file_name().to_string_lossy().into_owned();
        let skill_path = path.to_string_lossy().into_owned();

        let (parsed_name, description) = fs::read_to_string(&skill_file)
            .map(|content| parse_skill_front_matter(&content))
            .unwrap_or_default();

        let name = if parsed_name.is_empty() {
            id.clone()
        } else {
            parsed_name
        };

        skills.push(SkillInfo {
            id,
            name,
            description,
            path: skill_path,
            source: source.to_string(),
        });
    }

    skills.sort_by(|a, b| a.id.cmp(&b.id));
    skills
}

#[tauri::command]
pub fn scan_skills(project_path: String) -> Result<Vec<SkillInfo>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Cannot determine home directory".to_string())?;
    let global_dir = Path::new(&home).join(".claude").join("skills");
    let global_skills = scan_skill_dir(&global_dir, "global");

    let project_dir = Path::new(&project_path).join(".harness").join("skills");
    let project_skills = scan_skill_dir(&project_dir, "project");

    let mut result = Vec::new();
    let project_ids: std::collections::HashSet<String> =
        project_skills.iter().map(|s| s.id.clone()).collect();

    for skill in global_skills {
        if !project_ids.contains(&skill.id) {
            result.push(skill);
        }
    }
    result.extend(project_skills);
    result.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(result)
}

#[tauri::command]
pub fn write_skill_file(
    project_path: String,
    skill_id: String,
    content: String,
) -> Result<(), String> {
    let skill_dir = Path::new(&project_path)
        .join(".harness")
        .join("skills")
        .join(&skill_id);
    fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    fs::write(skill_dir.join("SKILL.md"), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_skill(project_path: String, skill_id: String) -> Result<(), String> {
    let skill_dir = Path::new(&project_path)
        .join(".harness")
        .join("skills")
        .join(&skill_id);
    if skill_dir.exists() {
        fs::remove_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}
