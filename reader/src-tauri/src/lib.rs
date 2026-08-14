//! Reader desktop shell — Phase 1.
//!
//! Wires up:
//!   - single-instance plugin (OS double-click funnels into the running app)
//!   - first-launch argv file parsing
//!   - the workspace state + open_document router (§16)
//!   - high-level commands (§24)
//!
//! PDF / Markdown engines are intentionally absent here; Phase 1 verifies the
//! shell with plain-text placeholders (§30 Phase 1).

mod commands;
mod workspace;

#[cfg(target_os = "macos")]
use tauri::{Manager, RunEvent};
use workspace::new_shared;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init();

    let mut builder = tauri::Builder::default();

    // Single-instance: a second `reader.exe <file>` invocation forwards argv
    // to the already-running process instead of starting a new one (§15, §16).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(
            |app, argv, _cwd| {
                commands::handle_single_instance(app, argv);
            },
        ));
    }

    builder
        .manage(new_shared())
        .invoke_handler(tauri::generate_handler![
            commands::get_workspace,
            commands::open_document_command,
            commands::focus_tab,
            commands::close_tab,
            commands::read_file_bytes,
            commands::log_frontend,
        ])
        .setup(|app| {
            // Open files passed on the command line at first launch, before the
            // window is shown, so the very first paint already has the tab.
            commands::open_initial_files(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // macOS: Finder "Open With" / double-click on an already-running
            // app arrives as an OpenFiles event (§15). Other platforms route
            // double-clicks through the single-instance plugin / first-launch
            // argv parsing instead.
            #[cfg(target_os = "macos")]
            {
                if let RunEvent::Opened { urls } = event {
                    for url in urls {
                        if let Ok(path) = url.to_file_path() {
                            if let Some(s) = path.to_str() {
                                let ws = app_handle
                                    .state::<workspace::SharedWorkspace>()
                                    .inner();
                                if let Err(e) = commands::open_document(app_handle, ws, s) {
                                    log::warn!("open_document('{s}') failed: {e}");
                                }
                            }
                        }
                    }
                }
                let _ = &event;
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = (app_handle, event);
            }
        });
}
