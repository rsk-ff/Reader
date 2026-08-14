# Reader

Lightweight PDF / Markdown desktop reader. Design spec: [`../轻量 PDF - Markdown 桌面阅读器技术方案.md`](../轻量%20PDF%20-%20Markdown%20桌面阅读器技术方案.md).

```
Tauri 2 · Rust · React + TypeScript · Vite · Zustand
```

## Phase 4 — PDF annotation (current)

PDFium (`pdfium-render` v0.9, dynamic `pdfium.dll` from bblanchon/pdfium-binaries
chromium/7999) wired in behind a `PdfMutationBackend` trait (§4). All pdfium-render
concrete types are confined to `src-tauri/src/pdf/`; the command layer only sees
the trait, so the backend is swappable.

What works:

- **6 annotation types**: Highlight, Underline, Strikeout (text-markup via
  QuadPoints), Note, Free Text, Ink (drawn as line path objects).
- **Create / Read / Delete**: `create_annotation`, `get_annotations`,
  `delete_annotation` commands (§24). Update is remove+recreate (§5).
- **Standard PDF output**: annotations written via PDFium's FPDF annotation API,
  so any standards-compliant reader sees them.
- **Coordinate conversion** (§5): `screenToPdf` / `pdfToScreen` centralized in
  `coordinates.ts`; no per-tool transform math.
- **SVG overlay layer** (§5): sits above canvas + text layer; text-markup
  tools capture DOM selection ranges → quads; ink draws via pointer events;
  note/freetext placed by click. Double-click an annotation to delete it.
- **Annotation toolbar**: select / highlight / underline / strikeout / note /
  freetext / ink tools + save button. Ctrl+S persists.
- **Dirty sync**: creating an annotation marks the document dirty (tab shows ●);
  save clears it.
- **Atomic save** (§7): create/delete already write through atomically
  (tmp → fsync → rename); explicit `save_document` re-flushes.

### Verification

- 4 Rust PDFium integration tests: highlight create+read-back, note create+delete,
  freetext create+save-round-trip, cross-verification fixture. All pass.
- **Test 5 (third-party)**: a highlight + freetext created via our backend was
  read back by **pypdf** (independent PDF library) — confirmed standard
  `/Highlight` and `/FreeText` subtypes with correct `/Contents`. Visible in
  Acrobat / Chrome / Firefox / Okular.

### Known limitations

- Annotation overlay only loads annotations for the current visible page.
- Ink stroke width is fixed (1.5pt).
- No annotation move/resize yet (Phase 4 focused on create/delete).

## Phase 3 — Markdown

Milkdown (Crepe) WYSIWYG editor wired in behind a lazy-loaded adapter (§2.1:
opening a PDF never pulls in the Milkdown/ProseMirror chunk).

What works:

- **WYSIWYG**: Typora-like editing via Crepe — GFM, task lists, tables, fenced
  code (CodeMirror), links, images, blockquotes, frontmatter, latex.
- **Source mode**: plain textarea showing the raw markdown (Ctrl+/ to toggle,
  or the Rendered|Source buttons). Switching back re-mounts Crepe with the
  edited text. Unknown syntax survives because source mode is raw text (§13).
- **Save**: Ctrl+S writes through `save_file_text` (atomic: tmp → fsync →
  rename, §7). Dirty flag syncs to the workspace so the tab shows ●.
- **Byte-for-byte integrity**: a file opened but not edited is never written,
  so SHA256 is unchanged on close (§14, Test 7 — verified).
- **Tab preservation**: switching tabs hides, never unmounts (§10).

### Verification (dev, no screen)

- `gfm.md` (122 chars): Milkdown init OK, no errors.
- `unknown-syntax.md` (admonition `!!! note` block): loads without error —
  unknown syntax doesn't crash the parser (§13).
- **Test 7**: open `gfm.md`, don't edit, close → `sha256sum` before == after. ✅

## Phase 2 — PDF reading

PDF.js (`pdfjs-dist` v6) wired in behind a lazy-loaded adapter (§2.1: a
Markdown-only session never pulls in the pdfjs chunk / worker).

What works:

- **Render**: high-DPI canvas (capped at 2×) + pdfjs `TextLayer` for selection.
- **Virtualized rendering**: only the viewport ± 2 pages are rendered; far
  canvases keep their last bitmap as a snapshot and the space is reserved so
  scroll position stays stable (§9, §27).
- **Zoom**: fit-width / fit-page / manual, +/- buttons, Ctrl+= / Ctrl+- / Ctrl+0.
  Fit recomputes on container resize.
- **Scroll + current page**: IntersectionObserver tracks the visible range and
  the most-visible page; the toolbar shows `page / total` and accepts a jump.
- **Search**: scans every page's text content (chunked, non-blocking), highlights
  hits in the text layer, next/prev jumps across pages.
- **Outline**: `doc.getOutline()` → sidebar tree → click navigates to the dest
  page (or opens external links).
- **Thumbnails**: sidebar, lazy-rendered via their own IntersectionObserver.
- **Print**: Ctrl+P renders all pages into a print window and calls the OS dialog
  (basic; Phase 7 will refine for huge documents).
- **Tab preservation**: switching tabs hides, never unmounts — scroll/zoom state
  survives (§10).

### Verification (dev, no screen)

An error-reporting bridge (`window.onerror` → Rust `log_frontend`) surfaces
webview runtime errors in the `tauri dev` log. With real fixture PDFs:

```
[frontend] pdf loaded: 3 pages from …/text-3.pdf
[frontend] pdf loaded: 1000 pages from …/blank-1000.pdf   (working set ~29 MB)
```

- 3-page text PDF: parsed + page 1 rendered at fit-width scale, no errors.
- 1000-page blank PDF: loads, page 1 renders, no OOM, ~29 MB RSS — confirms
  virtualization (not 1000 full-resolution canvases). (Test 4 core)

### Known limitations (deferred)

- File bytes are read whole over IPC (`read_file_bytes`); Phase 7 switches to
  the Tauri asset protocol for true range streaming on huge PDFs.
- Print renders every page sequentially; fine for tens of pages, slow for 1000.
- Search highlight is span-level, not sub-string rect precise.

## Phase 1 — Desktop shell

What works now:

- **Single instance** (`tauri-plugin-single-instance`): a second launch forwards its
  argv to the running app and exits. No second process. (spec §15, §16, Test 2)
- **File associations**: `.pdf` / `.md` / `.markdown` registered in `tauri.conf.json`
  `bundle.fileAssociations`. Takes effect on a bundled install. (spec §15)
- **`open_document` router** (`src-tauri/src/commands.rs`, `workspace.rs`):
  the single entry point for OS double-click, drag-in, CLI, and (later) File→Open.
  Canonicalizes the path and dedupes — the same file never opens as two sessions.
  (spec §16)
- **Tab system**: strip with focus / close / middle-click-close, dirty indicator,
  active highlight. Backed by `DocumentSession` + `WindowTab` + window state so the
  model is already split for Phase 6 tab detach. (spec §10, §17, §18)
- **Drag-in**: drop files onto the window → real OS paths via the window
  drag-drop event (no plugin). (spec §16)
- **Placeholder view**: shows file name / type / size / revision. The PDF and
  Markdown engines land in Phase 2 / 3. (spec §30 Phase 1)

What is intentionally **not** here yet: PDF.js, PDFium, Milkdown, annotations,
page mutation, transactional save, tab reorder/detach, multi-window. See spec §30.

## Run

```bash
pnpm install
pnpm tauri dev
```

### Verify Phase 1 without a bundled install

File associations only fire on an installed build, so in dev verify via CLI args
and drag-in:

```bash
# 1. CLI args (first-launch path) — one tab per file:
pnpm tauri dev -- path/a.pdf path/b.md

# 2. Drag-in: drop files onto the running window.

# 3. Single-instance: with the app already running, launch the binary again
#    with a file — it forwards to the running app and exits (exit 0),
#    and a new tab appears in the existing window.
./src-tauri/target/debug/reader.exe path/c.md
```

## Project layout

```
reader/
├── src/
│   ├── app/App.tsx            # shell: tab strip + tab stack (hide, not unmount)
│   ├── components/            # TabStrip, PlaceholderView, EmptyState
│   ├── documents/
│   │   ├── DocumentView.tsx   # routes by doc_type; lazy-loads each engine
│   │   ├── pdf/               # PdfViewer, PdfPage, PdfToolbar, PdfSidebar,
│   │   │                     #   usePdfDocument, search, outline, pdfjs
│   │   └── markdown/          # MarkdownEditor, MilkdownCrepe, MarkdownToolbar,
│   │                         #   useMarkdownText (load + atomic save)
│   ├── workspace/             # store (zustand), types, useFileDrop
│   ├── styles.css
│   └── main.tsx               # + frontend error bridge
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # builder: single-instance, setup, run event, logger
│   │   ├── commands.rs        # open_document router + commands (§24)
│   │   │                     #   read_file_bytes/text, save_file_text (atomic),
│   │   │                     #   set_dirty, get/create/update/delete_annotation,
│   │   │                     #   save_document, log_frontend, canonicalize_path
│   │   ├── workspace.rs       # AppWorkspace / DocumentSession / WindowTab (§10,§18)
│   │   └── pdf/               # PdfMutationBackend trait + pdfium-render impl (§4,§5)
│   │       ├── mod.rs         #   PdfMutationBackend trait
│   │       ├── annotation.rs #   PdfAnnotation model (§5)
│   │       ├── pdfium.rs     #   pdfium-render backend + tests
│   │       └── save.rs
│   ├── lib/bin/pdfium.dll    # PDFium dynamic library (bblanchon/pdfium-binaries)
│   ├── capabilities/default.json
│   └── tauri.conf.json        # window + file associations (§15)
└── tests/fixtures/            # PDFs + gfm/unknown-syntax/frontmatter .md
```

## Tests

Workspace routing logic (dedupe, tab creation, close/repack, session retention)
is unit-tested in `src-tauri/src/workspace.rs`:

```bash
cd src-tauri && cargo test --lib
```
