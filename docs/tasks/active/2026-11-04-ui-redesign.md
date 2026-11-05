# 界面改版（浅色，方向 A）

- Status: `waiting_user_acceptance`
- Created: `2026-11-04`
- Base: `dev@b517d0d`，分支 `claude/project-thread-gsfh7v`

## Goal

把整个软件换成用户选定的方向 A：黑白灰、无蓝色强调、Lucide 图标、思源黑体界面字体、Markdown 正文思源宋体、工具栏统一放在顶部。先做浅色，深色以后再做。

## Related context

- 设计稿（Claude Design 画布，第一页“选定方案 A”）：新标签页、PDF 阅读、Markdown 编辑、规范与小组件、Logo。
- 样式入口：[`reader/src/styles.css`](../../../reader/src/styles.css) 顶部 `:root` 设计变量；Markdown 编辑器 [`milkdownTheme.css`](../../../reader/src/documents/markdown/milkdownTheme.css)。
- 图标：[`UiIcon.tsx`](../../../reader/src/components/UiIcon.tsx)（待换成 Lucide 路径）。

## Scope and acceptance

分阶段，每阶段一个或几个 commit，阶段结束给用户检查版：

1. 设计变量：所有颜色、圆角、阴影、字体走 `:root` 变量，数值不变。已完成。
2. 换变量数值：方向 A 配色、6px 控件圆角、8px 面板圆角、思源黑体/宋体（Windows 11 自带，不打包字体）。已完成，等用户验收。
3. 标题栏与标签：标签与内容区相连的上圆角样式、新 logo 占位（Fluent 银杏）。
4. 工具栏与侧栏：PDF 右侧工具栏移到顶部一行；标记工具（高亮/下划线/删除线合并，弹出选样式和颜色）；缩略图右键菜单插入/删除页面；保存按钮改图标加未保存圆点；Markdown 工具栏去掉撤销/重做，排版/源码切换放右侧。
5. 图标：UiIcon 换成 Lucide（ISC 许可，路径内嵌，不新增依赖）。
6. 弹窗、菜单、提示的统一样式。
7. PDF 显式保存：核实后发现 2026-10-27 起已通过私有工作副本实现（保存才写回，关闭提示），只是 STATUS/删页提示文案过时；已改文案。

不处理：深色模式、正式 logo（当前为占位）。

- [ ] 用户在真实 Windows 桌面验收每一阶段。
- [ ] `pnpm --dir reader test`、`pnpm --dir reader build`、`pnpm --dir reader test:browser` 通过。

## Progress and verification

- 2026-11-04：阶段 1、2 完成（commit `0d43201`、`5c4a7cf`）；PDF.js 6 自绘选区层另行覆盖为灰色。
- 2026-11-04：阶段 3 完成（`ae306c6`）：标题栏 40px，标签 34px 上圆角并与内容区相连，银杏占位 logo（`app-logo.svg`，原生图标未改）。单元 133、浏览器 90、构建通过。
- 2026-11-04：用户反馈拖不动窗口、最大化顶边点不到标签、标签上沿偏远；修复为 38px 标题栏、标签距顶 4px、点击区延伸到顶边（`a2acc46`、`7fc8817`），通过。
- 2026-11-04：阶段 4+5 完成（`606fa6e`）：PDF/Markdown 右侧竖栏移除，工具进顶部一行；标记工具合并并带样式/颜色弹出框；缩略图右键插页/删页；保存改图标加圆点；全部界面图标换 Lucide，删除 Bootstrap SVG 与许可。单元 133、浏览器 92、构建通过。

## User acceptance

- 阶段 2（配色、圆角、字体）：2026-11-04 通过（含 PDF 灰色选区“够明显”）。
- 阶段 3（标题栏与标签）：2026-11-04 通过（修复拖动区域与最大化时顶边切换标签后）。
- 阶段 4+5（顶部工具栏、Lucide 图标）：2026-11-05 用户说“继续”，视为通过。
- 阶段 6（弹窗统一、关闭提示中文化，`964338b`）：2026-11-05 用户同意继续。
- 下划线/删除线修正：waiting

## Next action

等用户验收下划线/删除线；之后整体检查、合入 dev。
