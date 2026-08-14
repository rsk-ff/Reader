# Reader

Lightweight PDF / Markdown desktop reader. Design spec: [`../轻量 PDF - Markdown 桌面阅读器技术方案.md`](../轻量%20PDF%20-%20Markdown%20桌面阅读器技术方案.md).

```
Tauri 2 · Rust · React + TypeScript · Vite · Zustand
```

## Phase 1 — Desktop shell (current)

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
│   ├── app/App.tsx            # shell: tab strip + content area
│   ├── components/            # TabStrip, PlaceholderView, EmptyState
│   ├── workspace/             # store (zustand), types, useFileDrop
│   ├── styles.css
│   └── main.tsx
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs             # builder: single-instance, setup, run event
│   │   ├── commands.rs        # open_document router + tauri commands (§24)
│   │   └── workspace.rs       # AppWorkspace / DocumentSession / WindowTab (§10,§18)
│   ├── capabilities/default.json
│   └── tauri.conf.json        # window + file associations (§15)
└── tests/fixtures/            # minimal placeholder fixtures
```

## Tests

Workspace routing logic (dedupe, tab creation, close/repack, session retention)
is unit-tested in `src-tauri/src/workspace.rs`:

```bash
cd src-tauri && cargo test --lib
```
