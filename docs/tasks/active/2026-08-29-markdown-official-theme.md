# Markdown 官方主题整合

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-08-29`
- Last updated: `2026-08-29`
- Base branch: `master`
- Base commit: `0f62c3e`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

用户反馈 Markdown 渲染仍然较差，要求参考成熟实现。先完整采用已安装 Milkdown Crepe 的官方主题，减少手写排版规则，再由用户检查实际阅读与编辑体验。

## Related context

- [产品行为](../../PRODUCT.md#markdown)
- [Markdown 架构](../../ARCHITECTURE.md#markdown-path)
- [开发和验证](../../DEVELOPMENT.md)
- [编辑器封装](../../../reader/src/documents/markdown/MilkdownCrepe.tsx)
- [主题适配](../../../reader/src/documents/markdown/milkdownTheme.css)
- [编辑器与保存](../../../reader/src/documents/markdown/MarkdownEditor.tsx)
- [应用样式](../../../reader/src/styles.css)
- [排版检查样本](../../../reader/tests/fixtures/markdown-theme-review.md)
- [Crepe 官方样式文档](https://milkdown.dev/docs/guide/styling)

## Current behavior

- 基线：项目使用 `@milkdown/crepe ^7.22.1`，只导入官方 `common/style.css`，未接入完整主题；编辑器根节点挂有 `markdown-body`，GitHub CSS 与自定义标题、段落、列表、表格、代码块覆盖共同生效。
- 当前：按 common → Frame → `milkdownTheme.css` 导入，删除 250 行旧覆盖及 `github-markdown-css` 依赖；适配文件只设置本地字体、内容宽度/边距和 CodeMirror 等宽字体。
- 用户只报告整体渲染效果差，尚未提供具体错误样本；不能将所有问题直接归因于样式混用，当前结果尚待视觉验收。

## Expected behavior

所见即所得区域使用 Crepe 官方完整浅色主题，标题、列表、表格、引用、代码块和编辑控件统一由上游样式负责；保留本地中英文字体、内容宽度和窄窗口边距适配。源码切换、目录、显式保存和未保存状态保持原有行为。

## Scope

- `MilkdownCrepe.tsx`、Markdown 样式、直接相关依赖与锁文件。
- 现有 Markdown 检查样本、任务记录、产品/架构/状态和变更日志。

## Out of scope

- 不更换为 Vditor，不加入第二套 Markdown 渲染引擎。
- 不修改 PDF、窗口管理、文件读写或 Markdown 解析和保存逻辑。
- 不添加新生产依赖，不发布安装包，不自行截图或执行桌面视觉验收。

## Constraints and decisions

- 采用 Crepe 官方 Frame 浅色主题及其 common 样式，不继续套 GitHub 静态 HTML 样式。
- 优先使用 Crepe 字体变量与外层布局；避免覆盖其内部标题、列表、表格和代码块结构。
- 保留现有禁用 AI/TopBar 的配置和显式保存边界。
- Codex 已定位具体修改点，直接实施；本地时间在 Pi 免费窗口外，不调用 Pi。

## Acceptance criteria

- [x] 官方完整主题已接入，GitHub CSS 与内部排版覆盖已移除。
- [x] 原有目录、源码切换、保存逻辑未改动。
- [x] 前端测试、TypeScript/生产构建、文档与 diff 检查通过。
- [x] 可检查版本已启动；本轮改动以 `fix: adopt official Crepe markdown theme` 本地提交交付，最终 Git 状态在交付时检查。
- [ ] 用户确认视觉和交互结果。

## Progress

- [x] 检查 Git、当前实现及候选成熟组件。
- [x] 用户同意先采用 Crepe 官方完整主题。
- [x] 实施并验证。
- [x] 启动应用等待用户反馈。

## Discoveries

- Vditor 可作为后续替换候选；只有官方 Crepe 对照仍不能满足需求时才另行评估，不在本轮并行引入。
- 已安装 Crepe 版本为 `7.22.1`；Frame 主题不导入远程字体，使用本地字体变量即可。
- 保留原有 CodeMirror 浅色配置：Crepe 默认注入 oneDark，现有 `theme: null as never` 让 CodeMirror 使用 basicSetup 浅色高亮，未改变其运行逻辑。
- `tauri dev` 的应用参数需要两个 `--`。首次按原开发文档启动时，样本正常传入，但 Cargo 的 `--color always` 被混入 Reader 参数，产生一次 `open_document('always')` 警告；已根据本地 CLI 帮助修正开发文档，不扩大到应用参数解析修改，也未强制重启已交给用户的窗口。

## Verification

- `pnpm --dir reader test` — passed，15 个文件、100 个测试。
- `pnpm --dir reader build` — passed，TypeScript 与 Vite 生产构建成功，仅保留既有大 chunk 警告。
- 构建产物静态检查 — passed，Markdown CSS 含 Frame 主题、官方列表/表格和本地代码字体，无 `markdown-body`、无远程 CSS 导入。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — passed。
- `git diff --check` — passed；已审查应用改动、依赖锁文件、文档与新增样本。
- 启动检查 — Vite 1420 端口监听，Reader debug 进程 `36168` 有非零窗口句柄；截至启动检查未发现 `milkdown init failed` 或前端运行错误。首次启动的参数警告见 Discoveries。
- Rust、安装包：本轮无对应代码改动，按风险不重复执行完整检查。

## User acceptance

waiting。已传入临时样本 `C:\Users\fanq1\AppData\Local\Temp\Reader-Markdown-Theme-Review-20260829-231539.md`，可自由修改和保存，不影响仓库样本。

1. 检查标题、正文、嵌套/任务列表、表格对齐、代码高亮与等宽字体。
2. 缩窄窗口，检查换行、编辑控件和滚动；点击目录跳转。
3. 修改临时样本，切换源码后切回，保存并确认未保存标记消失；同时用此前渲染较差的实际 Markdown 对照。

启动日志保存在同一临时目录的 `Reader-Markdown-Theme-20260829-231539.stdout.log` 与 `.stderr.log`。

## Risks and remaining work

- 官方主题的外观和实际编辑交互仍需用户验收。
- 本轮只统一样式，不承诺解决尚未提供样本的 Markdown 语法兼容问题。

## Next action

等待用户检查当前版本，将反馈转化为具体样本和验收条件，在本任务内继续调整。

## Outcome

实现与自动化验证完成，以 `fix: adopt official Crepe markdown theme` 本地提交交付；视觉与交互验收未完成，任务保留 active。
