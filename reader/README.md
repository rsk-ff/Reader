# Reader

Windows desktop reader/editor for PDF and Markdown files.

```text
Tauri 2 · Rust · React 19 · TypeScript · Vite · Zustand
PDF.js · PDFium · Milkdown/Crepe
```

The original design document is [`../轻量 PDF - Markdown 桌面阅读器技术方案.md`](../轻量%20PDF%20-%20Markdown%20桌面阅读器技术方案.md). This README describes the implementation as it exists now; the design document is not a guarantee that every planned feature is complete.

## Architecture

### PDF

- PDF.js owns the complete read path: parsing, page rendering, text and annotation layers, search, links, outline, thumbnails, zoom, and print rendering.
- PDF.js streams revisioned bytes through the asynchronous `reader-file` Range protocol. The protocol only serves canonical PDF paths that are already open in the Rust workspace.
- Page dimensions, crop boxes, intrinsic rotation, and the PDF-to-viewport affine transform come from PDF.js `PageViewport`; annotation tools reuse that transform instead of maintaining a second renderer's geometry.
- PDFium is confined to file mutations: annotation create/update/delete, blank-page insertion, page deletion, and atomic save. These calls run on blocking workers behind one process-wide PDFium lock.
- A successful PDFium mutation increments the source revision, causing PDF.js to reopen the changed file instead of reusing stale pages.

This split is deliberate. Mature PDFium viewers exist inside Chromium and Qt, but their viewer layers are coupled to those UI/runtime stacks. Smaller reusable projects target WinForms, Android, or demo-grade GLFW/ImGui applications; none provides a maintained viewer core that fits this Tauri/React application without importing a second UI stack.

### Markdown

- Milkdown/Crepe provides the WYSIWYG editor; a raw source mode is available with `Ctrl+/`.
- The in-memory Markdown string is shared by both modes.
- `Ctrl+S` writes through a temporary file, flushes it, and atomically replaces the original.
- Saves are revision-aware: an edit made while a save is in flight remains dirty and is not incorrectly reported as saved.

### Workspace and windows

- A global Rust workspace owns `DocumentSession`, `WindowTab`, and per-window tab order.
- Opening a canonical path is deduplicated.
- Tabs stay mounted while switching, preserving viewer/editor state inside one window.
- Tabs can be reordered and detached into native windows. Dynamic windows use the same Tauri capability as the main window.
- Unsaved Markdown tabs prompt before close and cannot be detached yet because the in-memory editor state is not transferable between webviews.
- Session metadata is persisted under the application data directory and restored on the next launch.

## Implemented features

PDF:

- PDF.js continuous page view with fit-width, fit-page, manual zoom, and anchored `Ctrl`+wheel zoom.
- Text selection/copy and document-wide search with next/previous navigation.
- Lazy thumbnails.
- Outline/bookmark navigation and external-link handling.
- Printing through PDF.js page rendering.
- Highlight, underline, strikeout, note, free-text, and ink creation.
- Annotation deletion by double-clicking an overlay annotation.
- Blank-page insertion and page deletion.
- Atomic PDFium writes followed by a revisioned PDF.js reload.

Markdown:

- WYSIWYG and source modes.
- GFM-oriented editing through Crepe.
- Atomic explicit save and workspace dirty-state synchronization.
- No write occurs when a file is opened and closed without edits.

Desktop shell:

- Single-instance forwarding.
- `.pdf`, `.md`, and `.markdown` file associations in bundled builds.
- CLI and drag-and-drop file opening.
- Tab focus, close, middle-click close, reorder, and detach.
- `Ctrl+W`, `Ctrl+Tab`, and `Ctrl+Shift+Tab` navigation.

## Known limitations

- Existing annotations are displayed by PDF.js, but only annotations created in the current session are wired to the custom double-click deletion overlay.
- PDF mutations currently write through immediately. The dirty marker represents changes since the last explicit save checkpoint; closing cannot roll those PDF changes back.
- Moving a tab to another native window does not transfer frontend-only scroll, zoom, or unsaved editor state. Dirty Markdown detach is blocked to prevent data loss.
- Unsaved Markdown text has no crash-recovery sidecar; only normal tab/window closes can prompt before data is discarded.
- Printing renders every page sequentially and is not optimized for very large documents.
- The Milkdown editor is lazy-loaded but still produces a large chunk (about 1.5 MB minified).
- Packaging is currently configured for Windows and the tracked `pdfium.dll`.

## Development

Requirements:

- Node.js and pnpm
- Rust toolchain
- Windows with WebView2
- `src-tauri/lib/bin/pdfium.dll` (tracked in this repository)

```powershell
pnpm install
pnpm tauri dev
```

Open files from the command line:

```powershell
pnpm tauri dev -- tests/fixtures/text-3.pdf tests/fixtures/gfm.md
```

## Verification

```powershell
# Frontend regression tests
pnpm test

# TypeScript and production frontend build
pnpm build

# Rust integration/unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Treat every Clippy warning as an error
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings

# Windows NSIS debug installer
pnpm tauri build --debug --bundles nsis
```

The NSIS build copies the tracked PDFium library to `$INSTDIR/pdfium.dll`. Application startup binds that exact resource path instead of relying on the process working directory.

## Project layout

```text
reader/
├── src/
│   ├── app/                         application shell
│   ├── components/                  tabs and empty/placeholder views
│   ├── documents/
│   │   ├── DocumentView.tsx         document adapter router
│   │   ├── markdown/                Crepe editor, source mode, save logic/tests
│   │   └── pdf/                     PDF.js viewer, toolbar, annotations, coordinates/tests
│   ├── workspace/                   Zustand mirror of the Rust workspace
│   └── styles.css
├── src-tauri/
│   ├── capabilities/default.json    Tauri permissions for all Reader windows
│   ├── lib/bin/pdfium.dll           bundled PDFium runtime
│   ├── src/
│   │   ├── commands.rs              high-level Tauri commands
│   │   ├── lib.rs                   app lifecycle and protocol registration
│   │   ├── workspace.rs             document/tab/window model and tests
│   │   └── pdf/                     Range protocol and PDFium mutation adapter/tests
│   └── tauri.conf.json
└── tests/fixtures/                   PDF and Markdown fixtures
```

## Security boundary

The production webview uses a Content Security Policy. The PDF Range protocol supports only `GET`, `HEAD`, and `OPTIONS`, serves only canonical `.pdf` paths already open in the Rust workspace, and rejects arbitrary filesystem paths.
