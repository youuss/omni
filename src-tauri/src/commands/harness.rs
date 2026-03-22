use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

// ── Harness Definition ──

fn harness_path(project_path: &str) -> std::path::PathBuf {
    Path::new(project_path).join(".harness").join("harness.json")
}

fn templates_dir(project_path: &str) -> std::path::PathBuf {
    Path::new(project_path).join(".harness").join("templates")
}

#[tauri::command]
pub fn read_project_harness(project_path: String) -> Result<String, String> {
    let p = harness_path(&project_path);
    match fs::read_to_string(&p) {
        Ok(content) => Ok(content),
        Err(_) => Ok(String::new()),
    }
}

#[tauri::command]
pub fn write_project_harness(project_path: String, content: String) -> Result<(), String> {
    let p = harness_path(&project_path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&p, content).map_err(|e| e.to_string())
}

// ── Harness Templates ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HarnessTemplateInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub builtin: bool,
}

#[tauri::command]
pub fn list_harness_templates(project_path: String) -> Result<Vec<HarnessTemplateInfo>, String> {
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

        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            result.push(HarnessTemplateInfo {
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
pub fn read_harness_template(project_path: String, template_id: String) -> Result<String, String> {
    let path = templates_dir(&project_path).join(format!("{}.json", template_id));
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_harness_template(
    project_path: String,
    template_id: String,
    content: String,
) -> Result<(), String> {
    let dir = templates_dir(&project_path);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{}.json", template_id)), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_harness_template(project_path: String, template_id: String) -> Result<(), String> {
    let path = templates_dir(&project_path).join(format!("{}.json", template_id));
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Runs ──

fn runs_dir(project_path: &str) -> std::path::PathBuf {
    Path::new(project_path).join(".harness").join("runs")
}

fn archive_dir(project_path: &str) -> std::path::PathBuf {
    Path::new(project_path).join(".harness").join("archive")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunInfo {
    pub id: String,
    #[serde(default)]
    pub harness_id: String,
    #[serde(default)]
    pub state: String,
    pub created_at: Option<String>,
    pub input_files: Vec<String>,
    pub output_files: Vec<String>,
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
pub fn list_active_runs(project_path: String) -> Result<Vec<RunInfo>, String> {
    let dir = runs_dir(&project_path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let id = entry.file_name().to_string_lossy().into_owned();
        let input_files = read_dir_files(&path.join("inputs"))?;
        let output_files = read_dir_files(&path.join("outputs"))?;

        // Read run.json metadata if available
        let meta_path = path.join("run.json");
        let (harness_id, state) = if meta_path.exists() {
            let content = fs::read_to_string(&meta_path).unwrap_or_default();
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                (
                    val["harnessId"].as_str().unwrap_or("").to_string(),
                    val["state"].as_str().unwrap_or("draft").to_string(),
                )
            } else {
                (String::new(), "draft".to_string())
            }
        } else {
            (String::new(), "draft".to_string())
        };

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

        result.push(RunInfo {
            id,
            harness_id,
            state,
            created_at,
            input_files,
            output_files,
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn create_run(project_path: String, run_id: String) -> Result<(), String> {
    let run_dir = runs_dir(&project_path).join(&run_id);
    fs::create_dir_all(run_dir.join("inputs")).map_err(|e| e.to_string())?;
    fs::create_dir_all(run_dir.join("outputs")).map_err(|e| e.to_string())?;

    // Write initial run.json
    let meta = serde_json::json!({
        "harnessId": "",
        "state": "draft",
        "createdAt": chrono::Utc::now().to_rfc3339()
    });
    fs::write(
        run_dir.join("run.json"),
        serde_json::to_string_pretty(&meta).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_run_file(
    project_path: String,
    run_id: String,
    subpath: String,
) -> Result<String, String> {
    let file_path = runs_dir(&project_path).join(&run_id).join(&subpath);
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_run_file(
    project_path: String,
    run_id: String,
    subpath: String,
    content: String,
) -> Result<(), String> {
    let file_path = runs_dir(&project_path).join(&run_id).join(&subpath);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&file_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_run(project_path: String, run_id: String) -> Result<(), String> {
    let run_dir = runs_dir(&project_path).join(&run_id);
    if !run_dir.exists() {
        return Err(format!("Run directory not found: {}", run_id));
    }
    fs::remove_dir_all(&run_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_run(project_path: String, run_id: String) -> Result<(), String> {
    let src = runs_dir(&project_path).join(&run_id);
    let archive = archive_dir(&project_path);
    let date_prefix = chrono::Utc::now().format("%Y-%m-%d");
    let dest = archive.join(format!("{}-{}", date_prefix, run_id));

    if !src.exists() {
        return Err(format!("Run directory not found: {}", run_id));
    }
    fs::create_dir_all(&archive).map_err(|e| e.to_string())?;
    fs::rename(&src, &dest).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveInfo {
    pub id: String,
    pub original_run_id: String,
    pub date: String,
    pub files: Vec<String>,
}

#[tauri::command]
pub fn list_archived_runs(project_path: String) -> Result<Vec<ArchiveInfo>, String> {
    let dir = archive_dir(&project_path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut result = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();

        // Collect all files recursively from inputs/ and outputs/
        let mut files = Vec::new();
        for sub in &["inputs", "outputs"] {
            files.extend(read_dir_files(&path.join(sub))?);
        }
        // Also include run.json if present
        if path.join("run.json").exists() {
            files.push("run.json".to_string());
        }

        let (date, original_run_id) = if name.len() > 11 && &name[4..5] == "-" && &name[7..8] == "-" {
            (name[..10].to_string(), name[11..].to_string())
        } else {
            (String::new(), name.clone())
        };

        result.push(ArchiveInfo {
            id: name,
            original_run_id,
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
    archive_id: String,
    subpath: String,
) -> Result<String, String> {
    let file_path = archive_dir(&project_path).join(&archive_id).join(&subpath);
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

// ── Domains ──

fn domains_dir(project_path: &str) -> std::path::PathBuf {
    Path::new(project_path).join(".harness").join("domains")
}

fn validate_domain_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 64 {
        return Err("Domain name must be 1-64 characters".to_string());
    }
    let bytes = name.as_bytes();
    if !bytes[0].is_ascii_lowercase() {
        return Err("Domain name must start with a lowercase letter".to_string());
    }
    if bytes.len() > 1 && bytes[bytes.len() - 1] == b'-' {
        return Err("Domain name must not end with a hyphen".to_string());
    }
    if !name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Domain name must contain only lowercase letters, numbers, and hyphens".to_string());
    }
    Ok(())
}

const DEFAULT_SLOTS_JSON: &str = r#"{
  "slots": [
    { "id": "spec", "label": "Spec", "filename": "spec.md", "description": "Functional specification: purpose, features, user stories" },
    { "id": "api", "label": "API", "filename": "api.md", "description": "Interface definitions: REST/GraphQL/RPC endpoints, request/response formats" },
    { "id": "rules", "label": "Rules", "filename": "rules.md", "description": "Business rules: validation logic, state transitions, permission constraints" },
    { "id": "models", "label": "Models", "filename": "models.md", "description": "Data models: entity definitions, field descriptions, relationships" },
    { "id": "glossary", "label": "Glossary", "filename": "glossary.md", "description": "Glossary: domain-specific terms and abbreviations" }
  ]
}"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainSlot {
    pub id: String,
    pub label: String,
    pub filename: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SlotsFile {
    slots: Vec<DomainSlot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainMeta {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomainInfoResult {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub files: Vec<String>,
}

fn read_slots(project_path: &str) -> Result<Vec<DomainSlot>, String> {
    let slots_path = domains_dir(project_path).join("slots.json");
    if slots_path.exists() {
        let content = fs::read_to_string(&slots_path).map_err(|e| e.to_string())?;
        let slots_file: SlotsFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(slots_file.slots)
    } else {
        let slots_file: SlotsFile = serde_json::from_str(DEFAULT_SLOTS_JSON).unwrap();
        Ok(slots_file.slots)
    }
}

#[tauri::command]
pub fn list_domains(project_path: String) -> Result<Vec<DomainInfoResult>, String> {
    let dir = domains_dir(&project_path);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let slots = read_slots(&project_path)?;

    let mut result = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = entry.file_name().to_string_lossy().into_owned();

        let meta_path = path.join("domain.json");
        let meta: DomainMeta = if meta_path.exists() {
            let content = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
            serde_json::from_str(&content).map_err(|e| e.to_string())?
        } else {
            DomainMeta {
                name: dir_name.clone(),
                description: String::new(),
                tags: vec![],
            }
        };

        let files: Vec<String> = slots
            .iter()
            .filter(|s| path.join(&s.filename).exists())
            .map(|s| s.id.clone())
            .collect();

        result.push(DomainInfoResult {
            slug: dir_name,
            name: meta.name,
            description: meta.description,
            tags: meta.tags,
            files,
        });
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
pub fn read_domain_meta(project_path: String, domain: String) -> Result<String, String> {
    let domain_dir = domains_dir(&project_path).join(&domain);
    if !domain_dir.exists() {
        return Err(format!("Domain '{}' not found", domain));
    }
    let meta_path = domain_dir.join("domain.json");
    if !meta_path.exists() {
        let meta = DomainMeta {
            name: domain.clone(),
            description: String::new(),
            tags: vec![],
        };
        return serde_json::to_string_pretty(&meta).map_err(|e| e.to_string());
    }
    fs::read_to_string(&meta_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_domain_meta(
    project_path: String,
    domain: String,
    content: String,
) -> Result<(), String> {
    validate_domain_name(&domain)?;
    let domain_dir = domains_dir(&project_path).join(&domain);
    fs::create_dir_all(&domain_dir).map_err(|e| e.to_string())?;
    fs::write(domain_dir.join("domain.json"), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_domain_file(
    project_path: String,
    domain: String,
    file_type: String,
) -> Result<String, String> {
    let domain_dir = domains_dir(&project_path).join(&domain);
    if !domain_dir.exists() {
        return Err(format!("Domain '{}' not found", domain));
    }
    let slots = read_slots(&project_path)?;
    let slot = slots
        .iter()
        .find(|s| s.id == file_type)
        .ok_or_else(|| format!("Unknown file type '{}'", file_type))?;
    let file_path = domain_dir.join(&slot.filename);
    if !file_path.exists() {
        return Err(format!(
            "File type '{}' not found in domain '{}'",
            file_type, domain
        ));
    }
    fs::read_to_string(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_domain_file(
    project_path: String,
    domain: String,
    file_type: String,
    content: String,
) -> Result<(), String> {
    let domain_dir = domains_dir(&project_path).join(&domain);
    if !domain_dir.exists() {
        return Err(format!("Domain '{}' not found", domain));
    }
    let slots = read_slots(&project_path)?;
    let slot = slots
        .iter()
        .find(|s| s.id == file_type)
        .ok_or_else(|| format!("Unknown file type '{}'", file_type))?;
    fs::write(domain_dir.join(&slot.filename), content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_domain(project_path: String, domain: String) -> Result<(), String> {
    let domain_dir = domains_dir(&project_path).join(&domain);
    if !domain_dir.exists() {
        return Err(format!("Domain '{}' not found", domain));
    }
    fs::remove_dir_all(&domain_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_domain_slots(project_path: String) -> Result<String, String> {
    let slots = read_slots(&project_path)?;
    let slots_file = SlotsFile { slots };
    serde_json::to_string_pretty(&slots_file).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_domain_slots(project_path: String, content: String) -> Result<(), String> {
    let slots_file: SlotsFile =
        serde_json::from_str(&content).map_err(|e| format!("Invalid slots JSON: {}", e))?;

    let mut seen_ids = std::collections::HashSet::new();
    let mut seen_filenames = std::collections::HashSet::new();
    for slot in &slots_file.slots {
        if !seen_ids.insert(&slot.id) {
            return Err(format!("Duplicate slot id: '{}'", slot.id));
        }
        if !seen_filenames.insert(&slot.filename) {
            return Err(format!("Duplicate slot filename: '{}'", slot.filename));
        }
    }

    let dir = domains_dir(&project_path);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let canonical = serde_json::to_string_pretty(&slots_file).map_err(|e| e.to_string())?;
    fs::write(dir.join("slots.json"), canonical).map_err(|e| e.to_string())
}
