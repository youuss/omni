use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const PLANNER_MD: &str = include_str!("../../resources/agents/Planner.md");
const IMPLEMENTER_MD: &str = include_str!("../../resources/agents/Implementer.md");
const VERIFIER_MD: &str = include_str!("../../resources/agents/Verifier.md");
const ANALYZER_MD: &str = include_str!("../../resources/agents/Analyzer.md");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub id: String,
    pub prompt_path: String,
    pub config_path: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub builtin: bool,
}

#[derive(Debug, Default)]
struct FrontMatter {
    name: String,
    description: String,
    category: String,
}

fn parse_agent_front_matter(content: &str) -> FrontMatter {
    let mut fm = FrontMatter::default();

    let content = content.trim_start();
    if !content.starts_with("---") {
        return fm;
    }

    let rest = &content[3..];
    let end = match rest.find("\n---") {
        Some(i) => i,
        None => return fm,
    };

    for line in rest[..end].lines() {
        if let Some(val) = line.strip_prefix("name:") {
            fm.name = val.trim().to_string();
        } else if let Some(val) = line.strip_prefix("description:") {
            fm.description = val.trim().to_string();
        } else if let Some(val) = line.strip_prefix("category:") {
            fm.category = val.trim().to_string();
        }
    }

    fm
}

const BUILTIN_AGENTS: &[&str] = &["Planner", "Implementer", "Verifier", "Analyzer"];

#[tauri::command]
pub fn get_default_agent_prompt(name: String) -> Result<String, String> {
    match name.as_str() {
        "Planner" => Ok(PLANNER_MD.to_string()),
        "Implementer" => Ok(IMPLEMENTER_MD.to_string()),
        "Verifier" => Ok(VERIFIER_MD.to_string()),
        "Analyzer" => Ok(ANALYZER_MD.to_string()),
        _ => Err(format!("未知 agent: {}", name)),
    }
}

#[tauri::command]
pub fn scan_agents(project_path: String) -> Result<Vec<AgentInfo>, String> {
    let agents_dir = Path::new(&project_path).join(".claude").join("agents");
    let config_dir = Path::new(&project_path).join(".omni").join("agents");

    if !agents_dir.exists() {
        return Ok(vec![]);
    }

    let mut agents = Vec::new();

    for entry in fs::read_dir(&agents_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        // 只处理 .md 文件
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }

        let file_stem = path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();

        let prompt_path = path.to_string_lossy().into_owned();
        let config_path = config_dir.join(format!("{}.json", &file_stem)).to_string_lossy().into_owned();

        let fm = fs::read_to_string(&path)
            .map(|content| parse_agent_front_matter(&content))
            .unwrap_or_default();

        let name = if fm.name.is_empty() {
            file_stem.clone()
        } else {
            fm.name
        };

        let builtin = BUILTIN_AGENTS.contains(&file_stem.as_str());

        let category = if fm.category.is_empty() {
            match file_stem.as_str() {
                "Planner" | "Analyzer" => "planner".to_string(),
                "Implementer" => "implementer".to_string(),
                "Verifier" => "verifier".to_string(),
                _ => "custom".to_string(),
            }
        } else {
            fm.category
        };

        agents.push(AgentInfo {
            id: file_stem,
            prompt_path,
            config_path,
            name,
            description: fm.description,
            category,
            builtin,
        });
    }

    agents.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(agents)
}

#[tauri::command]
pub fn write_agent_file(
    project_path: String,
    agent_id: String,
    content: String,
) -> Result<(), String> {
    let agent_dir = Path::new(&project_path).join(".claude").join("agents");
    fs::create_dir_all(&agent_dir).map_err(|e| e.to_string())?;
    fs::write(agent_dir.join(format!("{}.md", agent_id)), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_agent(project_path: String, agent_id: String) -> Result<(), String> {
    // 删除 prompt 文件
    let prompt_file = Path::new(&project_path)
        .join(".claude")
        .join("agents")
        .join(format!("{}.md", &agent_id));
    if prompt_file.exists() {
        fs::remove_file(&prompt_file).map_err(|e| e.to_string())?;
    }

    // 删除 config 文件
    let config_file = Path::new(&project_path)
        .join(".omni")
        .join("agents")
        .join(format!("{}.json", &agent_id));
    if config_file.exists() {
        fs::remove_file(&config_file).map_err(|e| e.to_string())?;
    }

    Ok(())
}
