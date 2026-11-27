pub mod cli;
pub mod commands;
pub mod config;
pub mod exchange;
pub mod features;
pub mod files;
pub mod permissions;
pub mod platform;
pub mod presets;
pub mod search;
pub mod session;
pub mod tray;
pub mod updates;
pub mod usage;

use tauri::{Manager, RunEvent};

type Commands = Box<dyn Fn(tauri::ipc::Invoke) -> bool + Send + Sync>;

/// Tauri lets every window call an app's own commands, so refuse the others here (the tray panel).
fn for_main_window_only(commands: Commands) -> Commands {
    Box::new(move |invoke| {
        if tray::commands_allowed(invoke.message.webview_ref().label()) {
            commands(invoke)
        } else {
            invoke.resolver.reject("This window can't do that.");
            true
        }
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // First, so a second launch stops before doing anything. Two copies would overwrite each
        // other's settings and history, which is easy to cause once the window can hide in the tray.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::show_main(app)
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(commands::AppState::default())
        .manage(tray::TrayState::default())
        .on_window_event(tray::on_window_event)
        .invoke_handler(for_main_window_only(Box::new(tauri::generate_handler![
            commands::cli_status,
            commands::start_session,
            commands::send_message,
            commands::interrupt,
            commands::stop_session,
            commands::resolve_permission,
            commands::pending_permissions,
            commands::list_features,
            commands::list_presets,
            commands::export_data,
            commands::inspect_import,
            commands::run_import,
            commands::archive_list,
            commands::archive_get,
            commands::archive_delete,
            commands::app_version,
            commands::check_for_update,
            commands::download_update,
            commands::install_update,
            commands::search_conversations,
            commands::open_in_terminal,
            commands::read_config_file,
            commands::write_config_file,
            commands::run_cli,
            commands::usage_summary,
            commands::usage_limits,
            commands::usage_session,
            commands::refresh_limits,
            commands::usage_clear,
            commands::tray_apply,
            commands::tray_update,
            commands::tray_open,
            commands::tray_quit,
            commands::auth_status,
            commands::installer_preview,
            commands::run_setup_step,
            commands::get_config,
            commands::set_config,
            commands::save_transcript,
            commands::load_transcript,
            commands::delete_transcript,
        ])))
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
