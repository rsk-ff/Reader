# Product definition

## Purpose

Reader 为 Windows 用户提供一个启动快、界面轻量、同时处理 PDF 与 Markdown 的本地桌面工具。文档内容保留在本机；应用优先复用成熟文档引擎，不重新实现 PDF 排版或 Markdown 语法系统。

## Supported user workflows

### PDF

- 打开、拖入或通过文件关联启动 `.pdf` 文件。
- 连续阅读、缩放、搜索、复制文本、使用目录和缩略图导航。
- 打印文档。
- 新建高亮、下划线、删除线、便笺、自由文本和墨迹批注。
- 删除应用支持的批注，插入空白页和删除页面。

### Markdown

- 打开、拖入或通过文件关联启动 `.md` 与 `.markdown` 文件。
- 在所见即所得和源码模式之间切换。
- 显式保存，并正确显示未保存状态。
- 使用左侧目录浏览标题并跳转。

### Windows shell

- 在一个或多个原生窗口中使用标签页。
- 切换、关闭、重排、拖出和跨窗口停靠标签页。
- 在只有一个标签时通过标签区域拖动整个窗口。
- 使用 Windows 原生最小化、最大化、关闭和 Snap Layout 行为。
- 恢复上次会话中打开的文档。

## Product principles

- 数据完整性优先于便利性：存在未保存 Markdown 时，不执行可能丢失编辑内容的跨窗口移动。
- 当前代码和可复现行为优先于最初技术方案。
- 视觉和交互由用户在真实 Windows 桌面环境中验收。
- 优先解决阻断阅读、编辑、保存和窗口操作的问题，再扩充次要功能。

## Current non-goals

- 云同步、多人协作和在线账户系统。
- 用自研引擎替代 PDF.js、PDFium 或 Milkdown。
- 为未保存 Markdown 提供崩溃恢复或跨 webview 状态迁移。
- 在当前阶段承诺 Windows 之外的平台发布。

实际完成度和限制见 [`STATUS.md`](STATUS.md)。
