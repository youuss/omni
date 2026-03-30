mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // Project
            commands::project::open_project,
            commands::project::list_projects,
            commands::project::add_project,
            commands::project::remove_project,
            // Harness definition
            commands::harness::read_project_harness,
            commands::harness::write_project_harness,
            commands::harness::list_harness_templates,
            commands::harness::read_harness_template,
            commands::harness::write_harness_template,
            commands::harness::delete_harness_template,
            // Runs
            commands::harness::list_active_runs,
            commands::harness::create_run,
            commands::harness::read_run_file,
            commands::harness::write_run_file,
            commands::harness::delete_run,
            commands::harness::archive_run,
            commands::harness::list_archived_runs,
            commands::harness::read_archive_file,
            // Domains
            commands::harness::list_domains,
            commands::harness::read_domain_meta,
            commands::harness::write_domain_meta,
            commands::harness::read_domain_file,
            commands::harness::write_domain_file,
            commands::harness::delete_domain,
            commands::harness::read_domain_slots,
            commands::harness::write_domain_slots,
            // File
            commands::file::read_text_file,
            commands::file::write_text_file,
            commands::file::scan_directory,
            // Agents
            commands::agents::get_default_agent_prompt,
            commands::agents::scan_agents,
            commands::agents::write_agent_file,
            commands::agents::delete_agent,
            // Extensions
            commands::extensions::scan_extensions,
            commands::extensions::write_extension_file,
            commands::extensions::delete_extension,
            // Skills
            commands::skills::scan_skills,
            commands::skills::write_skill_file,
            commands::skills::delete_skill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
