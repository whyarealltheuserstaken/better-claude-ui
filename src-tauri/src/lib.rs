pub mod cli;
pub mod commands;
pub mod config;
pub mod features;
pub mod files;
pub mod permissions;
pub mod platform;
pub mod presets;
pub mod search;
pub mod session;
pub mod usage;

use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::cli_status,
            commands::start_session,
            commands::send_message,
            commands::interrupt,
            commands::stop_session,
            commands::resolve_permission,
            commands::pending_permissions,
            commands::list_features,
            commands::list_presets,
            commands::search_conversations,
            commands::open_in_terminal,
            commands::read_config_file,
            commands::write_config_file,
            commands::run_cli,
            commands::usage_summary,
            commands::usage_limits,
            commands::usage_clear,
            commands::auth_status,
            commands::installer_preview,
            commands::run_setup_step,
            commands::get_config,
            commands::set_config,
            commands::save_transcript,
            commands::load_transcript,
            commands::delete_transcript,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        // Never leave orphaned `claude` processes behind.
        if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
            let state = handle.state::<commands::AppState>();
            tauri::async_runtime::block_on(state.shutdown());
        }
    });
}
