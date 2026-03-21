mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::project::open_project,
            commands::project::list_projects,
            commands::project::add_project,
            commands::project::remove_project,
            commands::spec::list_active_changes,
            commands::spec::create_change,
            commands::spec::read_change_file,
            commands::spec::write_change_file,
            commands::spec::delete_change,
            commands::spec::archive_change,
            commands::spec::list_domains,
            commands::spec::list_archived_changes,
            commands::spec::read_archive_file,
            commands::file::read_text_file,
            commands::file::write_text_file,
            commands::file::scan_directory,
            commands::agents::get_default_agent_prompt,
            commands::agents::scan_agents,
            commands::agents::write_agent_file,
            commands::agents::delete_agent,
            commands::skills::scan_skills,
            commands::skills::write_skill_file,
            commands::skills::delete_skill,
            commands::pipeline::read_project_pipeline,
            commands::pipeline::write_project_pipeline,
            commands::pipeline::list_pipeline_templates,
            commands::pipeline::read_pipeline_template,
            commands::pipeline::write_pipeline_template,
            commands::pipeline::delete_pipeline_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
