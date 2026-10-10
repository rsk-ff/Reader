# Markdown 侧栏调宽与收起

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-09`
- Last updated: `2026-10-09`
- Base branch: `master`
- Base commit: `b087c09`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

Markdown 左侧目录支持拖动宽度和完全收起，给正文腾出空间。

## Related context

- [PRODUCT](../../PRODUCT.md) — Markdown 行为。
- [DEVELOPMENT](../../DEVELOPMENT.md) — 测试和独立验收窗口启动。
- [MarkdownEditor](../../../reader/src/documents/markdown/MarkdownEditor.tsx)、[MarkdownOutline](../../../reader/src/documents/markdown/MarkdownOutline.tsx)、[MarkdownToolbar](../../../reader/src/documents/markdown/MarkdownToolbar.tsx)。
- [styles.css](../../../reader/src/styles.css)、[浏览器入口](../../../reader/tests/browser/markdown-editor.jsx)。

## Current behavior

目录固定为 220px，窄窗口为 168px，没有调宽或收起入口。Git 工作树干净；两个既有活动任务与当前目标独立。

## Expected behavior

拖动目录右边缘调宽；顶部目录开关完全隐藏/展开侧栏，正文使用释放的全部空间。展开恢复本标签页宽度，源码/渲染切换不重置宽度和收起状态。

## Scope

Markdown 侧栏布局、顶部开关、相关浏览器回归和产品/状态/变更文档。

## Out of scope

PDF 侧栏、编辑/保存实现、跨启动布局持久化、图标任务、正式安装发布。

## Constraints and decisions

- 宽度在 120–560px 内，窄窗口同时为正文和右侧工具保留空间。
- 调宽不重建编辑器，不写入文档；开关和分隔条支持键盘。
- Codex 直接实现；不调用 Pi，不截图或使用桌面自动化做视觉验收。

## Acceptance criteria

- [x] 拖动目录右边缘可左右调宽，边界限制有效（浏览器功能验证）。
- [x] 侧栏完全收起，正文扩展；重新展开恢复宽度（浏览器功能验证）。
- [x] 两种模式可使用，修改内容和编辑器实例不因布局操作丢失（浏览器功能验证）。
- [x] 窄窗口不横向溢出，顶部开关/保存/打印可见（330px 浏览器验证）。
- [x] 浏览器功能、前端测试、生产构建、文档检查通过；连贯提交与干净工作树（提交主题见 Outcome）。
- [ ] 用户在 Reader 中验收视觉与交互。

## Progress

- [x] 检查 Git、当前文档与相关实现，明确范围。
- [x] 实现与自动验证。
- [x] 启动独立验收窗口并提交。

## Discoveries

- PDF 已有拖动侧栏实现，但 Markdown 使用独立固定宽度样式。
- 调宽和收起使用独立布局状态，不变更 Crepe key。窗口缩窄只限制实际显示宽度，放宽恢复原偏好；跨启动不持久化。
- 指针捕获结束、取消或丢失时清除拖动状态与正文禁止选择样式；分隔条支持方向键、Home/End。

## Verification

- `pnpm --dir reader test:browser -- markdown-sidebar.spec.ts markdown-tools.spec.ts markdown-selection.spec.ts` — 24 passed（新增侧栏 4 项），真实 React/Crepe/CSS；仅原生文件接口模拟，无截图/视频/trace。
- `pnpm --dir reader test` — 16 文件、111 项通过。
- `pnpm --dir reader build` — TypeScript 与 Vite 1206 模块通过，既有大 chunk 提示。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — 31 Markdown、3 活动任务、12 归档任务、2 决策记录通过。首轮发现 Related context 缺少链接，已修正并复验通过。
- `git diff --check` — passed；完整 diff 已审阅。
- Tauri 开发编译 — 1m37s 成功；独立标识 `com.earendil.reader.sidebar20261009`，窗口 `Reader · Markdown 侧栏验收` PID 58744、非零句柄 2559122、响应正常。Vite 当前侧栏模块包含拖动及窗口宽度上限实现；未做桌面视觉验收。
- 启动参数为 `C:\Users\fanq1\AppData\Local\Temp\reader-markdown-sidebar-20261009\sidebar-review.md`（样本副本）。临时配置同目录 `tauri-check.json`，dev 会话 7038，开发服务 `http://localhost:1420`；正式安装版保留。

## User acceptance

waiting。

1. 拖动目录右边缘，确认变宽/变窄及标题截断。
2. 点击顶部目录开关，确认完全收起、正文扩展；再展开确认宽度恢复。
3. 切换源码/渲染，缩窄窗口，确认开关和保存/打印可用，未保存内容保留。

## Risks and remaining work

实际 WebView2 交互待用户验收；本轮不修改 Rust 或生成安装包。

## Next action

等待用户在独立 Reader 窗口验收上面的三项；反馈在本会话修订同一任务，认可后归档。

## Outcome

实现、自动验证与可检查版本已交付；本地提交主题 `feat: make Markdown outline resizable and collapsible`，哈希以 Git 历史为准。实际视觉/交互尚待用户，保持活动任务；独立需求在本目标结束后新建会话。
