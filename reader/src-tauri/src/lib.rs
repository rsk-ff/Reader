//! Reader desktop shell.
//!
//! Wires up:
//!   - single-instance plugin (OS double-click funnels into the running app)
//!   - first-launch argv file parsing
//!   - session restore (§26) — windows/tabs/files survive a restart
//!   - multi-window tab system (§17, §18) — reorder, detach, attach
//!   - the workspace state + open_document router (§16)
//!   - high-level commands (§24)

mod commands;
pub mod pdf;
mod workspace;

#[cfg(target_os = "macos")]
use tauri::RunEvent;
use tauri::{Manager, WindowEvent};
use workspace::new_shared;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .try_init();

    let mut builder = tauri::Builder::default();

    // PDF.js streams only documents already opened in the workspace. All PDF
    // mutations remain behind explicit PDFium commands below.
    builder = builder
        .register_asynchronous_uri_scheme_protocol("reader-file", crate::pdf::handle_reader_file);

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            commands::handle_single_instance(app, argv);
        }));
    }

    builder
        .manage(new_shared())
        .on_window_event(|window, event| {
            // When a window is closed by the user, drop its tab slots from the
            // workspace (so the model stays consistent) and persist the session
            // for crash/quit recovery (§26). The main window's slots are kept
            // (it may outlive its tabs).
            if let WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let label = window.label().to_string();
                let ws = app.state::<workspace::SharedWorkspace>().inner();
                // remove_window is a no-op for main.
                if let Ok(mut guard) = ws.lock() {
                    guard.remove_window(&label);
                }
                commands::broadcast(app, ws);
                let _ = commands::save_session_impl(app, ws);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_workspace,
            commands::open_document_command,
            commands::focus_tab,
            commands::close_tab,
            commands::reorder_tabs,
            commands::detach_tab,
            commands::move_tab,
            commands::remove_window,
            commands::save_session,
            commands::log_frontend,
            commands::read_file_text,
            commands::save_file_text,
            commands::canonicalize_path,
            commands::set_dirty,
            commands::create_annotation,
            commands::update_annotation,
            commands::delete_annotation,
            commands::save_document,
            commands::discard_pdf_changes,
            commands::insert_blank_page,
            commands::delete_page,
        ])
        .setup(|app| {
            let bundled_pdfium = app.path().resource_dir()?.join("pdfium.dll");
            let development_pdfium = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("lib")
                .join("bin")
                .join("pdfium.dll");
            let pdfium_path = if bundled_pdfium.is_file() {
                bundled_pdfium
            } else {
                development_pdfium
            };
            crate::pdf::pdfium::configure_pdfium_library(pdfium_path)
                .map_err(std::io::Error::other)?;

            // Restore the previous session BEFORE opening CLI files so that
            // the freshly-double-clicked file wins focus (§26: current file
            // takes priority over session restore).
            commands::try_restore_session(app.handle());
            commands::open_initial_files(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Persist on exit so the next launch can restore (§26).
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                let ws = app_handle.state::<workspace::SharedWorkspace>().inner();
                let _ = commands::save_session_impl(app_handle, ws);
            }
            // macOS: Finder "Open With" / double-click on an already-running
            // app arrives as an OpenFiles event (§15).
            #[cfg(target_os = "macos")]
            {
                if let RunEvent::Opened { urls } = event {
                    for url in urls {
                        if let Ok(path) = url.to_file_path() {
                            if let Some(s) = path.to_str() {
                                let ws = app_handle.state::<workspace::SharedWorkspace>().inner();
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
