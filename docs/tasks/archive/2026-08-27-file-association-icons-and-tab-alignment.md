# 标签文件名对齐与 Windows 文件关联图标

- Status: `done`
- Owner: Codex
- Created: `2026-08-27`
- Last updated: `2026-08-27`
- Base branch: `master`
- Base commit: `0b47412`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

让标签中的文件名从文件图标右侧左对齐，并让 Windows 资源管理器中的 PDF 与 Markdown 文件在关联到 Reader 后分别显示专用类型图标；基于修改后的源码生成新的 Windows 安装包。

## Related context

- [docs/PRODUCT.md](../../PRODUCT.md)：Windows shell 的标签与文件关联行为。
- [docs/ARCHITECTURE.md](../../ARCHITECTURE.md)：标签、窗口和 Tauri bundle 边界。
- [docs/DEVELOPMENT.md](../../DEVELOPMENT.md)：自动化验证和 Windows bundle 命令。
- [reader/src/components/TabStrip.tsx](../../../reader/src/components/TabStrip.tsx)、`reader/src/styles.css`：标签布局。
- [reader/src-tauri/tauri.conf.json](../../../reader/src-tauri/tauri.conf.json)：文件关联、资源和安装器配置。
- [reader/src-tauri/windows/](../../../reader/src-tauri/windows/)：本任务新增的 Windows 安装器扩展。

## Current behavior

- `.tab-title` 继承标签按钮的居中文本对齐，文件名在其可用区域内居中。
- Tauri `bundle.fileAssociations` 只注册 PDF/Markdown 关联，NSIS 生成的 `DefaultIcon` 指向 `reader.exe,0`；WiX 生成的 ProgId 也没有类型专用图标。交叉检查当前机器发现 MSI 与 NSIS 旧安装并存，实际生效的 `PDF Document` 类仍指向 `reader.exe,0`，而 `Reader.pdf` 已有专用图标路径。
- 仓库已有的 release bundle 来自旧源码基线，不能作为本次修改的交付物。

## Expected behavior

- 标签文件名从文件类型图标右侧开始左对齐，保持现有截断、关闭按钮和窄标签行为。
- 安装后的 `.pdf` 使用 PDF 专用图标，`.md` 与 `.markdown` 使用 Markdown 专用图标；安装和卸载都刷新/清理关联图标注册表项。
- NSIS 与 MSI bundle 都包含所需图标资源，并可为各自生成的以及另一安装器可能遗留的关联类注册图标。

## Scope

- 修改标签标题的 CSS。
- 新增可复现的 PDF/Markdown Windows `.ico` 资源生成工具和资源文件。
- 新增 NSIS installer hook 与 WiX fragment，并在 Tauri bundle 配置中接入资源和扩展。
- 更新产品、架构、开发、状态、变更日志和任务记录。
- 运行前端/Rust/文档检查和 Windows bundle，记录安装包证据。

## Out of scope

- 不改变文件打开、默认应用优先级或文件关联备份/恢复策略。
- 不修改 Reader 应用内标签图标的现有 SVG 视觉设计，除非为窄布局验证所必需。
- 不处理代码签名、SmartScreen 或非 Windows 平台发布。

## Constraints and decisions

- 当前 Tauri CLI 为 `2.11.4`；其 `FileAssociation` schema 不支持 `icon` 属性，因此不能在每个关联对象中直接添加字段。
- 使用 Tauri 已支持的 `bundle.windows.nsis.installerHooks` 与 `bundle.windows.wix.fragmentPaths/componentRefs` 扩展点；不修改生成的 `target/` 文件。
- 使用独立的 PDF/Markdown `.ico` 文件作为资源，并通过 Windows `DefaultIcon` 注册表值指向安装目录中的资源。
- 本任务由 Codex 直接实现，不调用 Pi。

## Acceptance criteria

- [x] 标签文件名在图标右侧左对齐；窄标签下现有关闭按钮和图标保留策略不回归。
- [x] 新安装包中的 PDF、MD/Markdown 关联分别写入专用 `DefaultIcon`，资源管理器刷新后显示对应图标。
- [x] NSIS 和 MSI bundle 构建成功，资源、关联和卸载清理配置可从生成脚本/模板复核。
- [x] 相关自动化验证通过，文档与变更记录同步，工作树提交后干净。

## Progress

- [x] 完成 Git、项目文档、Tauri 配置和现有生成器产物检查。
- [x] 确认 Tauri 2.11.4 不支持逐关联 `icon` 字段，确定安装器扩展方案。
- [x] 实现标签布局和 Windows 图标安装器扩展。
- [x] 运行测试、构建和安装包验证。
- [x] 更新文档并完成用户视觉、文件关联及安装包验收。

## Discoveries

- 当前源码基线为 `0b47412`，工作树初始干净。
- 生成的 NSIS 使用 `APP_ASSOCIATE`，其宏本身支持图标参数；通过 `NSIS_HOOK_POSTINSTALL` 覆写 `PDF Document` 与 `Markdown Document` 的 `DefaultIcon` 即可复用现有关联流程。
- 生成的 WiX 使用 `Reader.pdf`、`Reader.md` 和 `Reader.markdown` ProgId；fragment 可通过独立组件写入对应 `DefaultIcon` 注册表项。
- NSIS 与 MSI 可以交叉升级；因此两类安装器都必须覆盖 `PDF Document`/`Markdown Document` 与 `Reader.*` 两套关联类，避免旧安装留下的当前生效 ProgID 继续使用应用主图标。
- 当前机器的 `.pdf`/`.md` 默认类分别仍是 `PDF Document`/`Markdown Document`，其旧 `DefaultIcon` 为已安装的 `reader.exe,0`；已安装 `file-pdf.ico` 与 `file-markdown.ico` 文件本身有效，但已安装主程序哈希不是本轮构建产物。
- 当前产品与状态文档已记录标签内类型图标，但未记录 Windows 资源管理器中的专用文件关联图标。

## Verification

- `pnpm --dir reader test` — passed；11 个测试文件、89 个测试通过。
- `pnpm --dir reader build` — passed。
- `cargo test --manifest-path reader/src-tauri/Cargo.toml` — passed；39 个测试通过。
- `cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check` — passed。
- `cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` — passed。
- `pnpm --dir reader tauri build --bundles msi` — passed；WiX 反编译确认五个 `DefaultIcon` 注册表值，覆盖两套关联类。
- `pnpm --dir reader tauri build --bundles nsis` — passed；生成脚本包含 hook、ICO 资源复制和卸载清理。
- MSI 反编译复核 — passed；五个组件均注册到 `[INSTALLDIR]file-pdf.ico` 或 `[INSTALLDIR]file-markdown.ico`，并全部被 `External` feature 引用。
- 当前机器关联诊断 — reproduced；`HKCU\Software\Classes\PDF Document\DefaultIcon` 与 `Markdown Document\DefaultIcon` 仍为旧 `reader.exe,0`，说明之前安装的包没有应用本轮关联修复。
- `node scripts/generate-file-association-icons.mjs` — passed；两个 ICO 各含 16/32/48/256 帧。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — passed；21 个 Markdown 文件、1 个活动任务、4 个归档任务和 2 个决策记录通过检查。

## User acceptance

accepted：用户于 2026-08-27 确认可以验收；标签文件名左对齐、PDF/MD 文件专用图标及安装包结果通过验收。

## Risks and remaining work

- 当前安装包未签名，SmartScreen 提示仍是已知限制。

## Next action

无；本任务已完成并归档。

## Outcome

实现、自动化验证和用户验收均已完成。NSIS 和 MSI 安装包已基于本次源码生成，本轮补齐了 MSI/NSIS 交叉升级时的关联类覆盖。提交主题为 `fix: repair cross-installer document association icons`。
