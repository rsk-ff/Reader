//! Reader desktop shell.
//!
//! Wires up:
//!   - single-instance plugin (OS double-click funnels into the running app)
//!   - first-launch argv file parsing
//!   - session persistence (§26) — workspace is saved for potential future
//!     recovery; automatic restore on launch is intentionally disabled
//!   - multi-window tab system (§17, §18) — reorder, detach, attach
//!   - the workspace state + open_document router (§16)
//!   - high-level commands (§24)

mod cloud_locations;
mod commands;
mod local_files;
mod markdown_file;
mod markdown_image;
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
        .register_asynchronous_uri_scheme_protocol("reader-file", crate::pdf::handle_reader_file)
        .register_asynchronous_uri_scheme_protocol(
            "reader-image",
            crate::markdown_image::handle_reader_image,
        );

    // Custom frame controls + native Windows 11 Snap Layout overlay for the
    // frameless titlebar. The plugin's page-load hook covers every webview
    // window (main + dynamically created/restored), so no per-window overlay
    // is installed here. On non-Windows targets the plugin is a no-op.
    builder = builder.plugin(
        tauri_plugin_frame::FramePluginBuilder::new()
            .titlebar_height(36)
            .button_width(46)
            .auto_titlebar(true)
            .snap_overlay(true)
            .build(),
    );
    builder = builder.plugin(tauri_plugin_dialog::init());
    // PDF links and outline URLs leave the webview through the system browser.
    builder = builder.plugin(tauri_plugin_opener::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            commands::handle_single_instance(app, argv);
        }));
    }

    builder
        .manage(new_shared())
        .manage(commands::new_tab_drag_monitor())
        .on_window_event(|window, event| {
            // When a window is closed by the user, drop its tab slots from the
            // workspace (so the model stays consistent) and persist the session
            // for crash/quit recovery (§26). The main window keeps an empty
            // workspace slot, but its tabs and documents are dropped too.
            if let WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let label = window.label().to_string();
                // The short-lived tab-drag preview is a native helper window,
                // not a workspace owner. Its destruction must not broadcast a
                // false workspace change or rewrite the saved session.
                if label != workspace::MAIN_WINDOW && !label.starts_with("win-") {
                    return;
                }
                let ws = app.state::<workspace::SharedWorkspace>().inner();
                // For main this keeps an empty slot but drops its tabs.
                if let Ok(mut guard) = ws.lock() {
                    guard.remove_window(&label);
                }
                commands::broadcast(app, ws);
                let _ = commands::save_session_impl(app, ws);
            }
        })
        .invoke_handler(tauri::generate_handler![
            local_files::get_local_locations,
            local_files::list_local_directory,
            local_files::create_local_markdown,
            commands::get_workspace,
            commands::open_document_command,
            commands::create_new_tab,
            commands::create_markdown_document,
            commands::focus_tab,
            commands::close_tab,
            commands::reorder_tabs,
            commands::detach_tab,
            commands::move_tab,
            commands::begin_tab_drag,
            commands::cancel_tab_drag,
            commands::complete_tab_drag,
            commands::remove_window,
            commands::save_session,
            commands::log_frontend,
            commands::read_file_text,
            commands::save_file_text,
            commands::save_markdown_document_as,
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

            // Open files supplied on the command line / via OS double-click.
            // Automatic session restore is intentionally disabled: a normal
            // launch starts with no previously opened documents/tabs (§26).
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
                                commands::open_external_document(app_handle, s);
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
