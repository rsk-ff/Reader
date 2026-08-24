# Current status

- Last updated: 2026-08-23
- Application version: `0.1.0`
- Current code baseline: `1f5bb93 feat: complete tab docking and markdown outline`

## Active task

- None.
- Most recently completed: [`tasks/archive/2026-08-23-project-documentation-system.md`](tasks/archive/2026-08-23-project-documentation-system.md).

## Implemented and automatically verified

- PDF 阅读、搜索、目录、缩略图、打印、批注和页面增删。
- 可填写 PDF 的表单内容只渲染一次，不再出现已复现的文字重影。
- Markdown 所见即所得/源码模式、显式保存、等宽代码字体、列表对齐和左侧目录。
- 标签切换、关闭、排序、拖出窗口、单标签窗口拖动和跨窗口停靠。
- Windows 自定义标题栏、原生窗口按钮和 Snap Layout。
- 文件关联、拖放打开、单实例文件转发和上次会话恢复。

2026-08-23 在代码基线 `1f5bb93` 上记录的验证：

- Frontend tests: `88 passed`。
- Rust tests: `32 passed`。
- TypeScript/frontend production build: passed。
- `cargo fmt --check`: passed。
- `cargo check`: passed。
- Tauri release build: passed。
- NSIS 和 MSI `0.1.0` 安装包已生成并计算 SHA-256。

## Waiting for user acceptance

- 单标签区域拖动窗口。
- 标签从一个原生窗口拖回另一个窗口。
- Markdown 左侧目录、代码字体和列表对齐的最终视觉效果。
- `0.1.0` 安装包的实际安装、升级和卸载流程。

这些项目没有用户验收前，不得标记为完全通过。

## Known limitations

- 只有当前会话中由应用创建且接入自定义覆盖层的批注支持双击删除。
- PDF 修改立即写入文件；关闭文档不能回滚这些写操作。
- 标签跨原生窗口移动不会迁移前端滚动、缩放等瞬时状态；未保存 Markdown 的跨窗口移动被阻止。
- 未保存 Markdown 没有崩溃恢复 sidecar。
- 打印会顺序渲染所有页面，对超大文档尚未优化。
- Milkdown 编辑器虽然延迟加载，仍会产生约 1.5 MB 的压缩 chunk。
- 当前发布目标为 Windows，安装包没有代码签名，可能触发 SmartScreen 提示。

## Recent completed work

- `1f5bb93` — complete tab docking and Markdown outline.
- `b283e0d` — create detached windows asynchronously.
- `4c9fab5` — prevent duplicate native titlebar overlay.
- `4af8f79` — render PDF forms once and start clean.
- `b056fd6` — reduce redundant PDF viewer work.

新开发任务开始时，Codex 按 `tasks/README.md` 判断是否需要自动创建活动任务文件。
