# Current status

- Last updated: 2026-08-27
- Application version: `0.1.0`
- Current application source baseline: `tab-width and compact tab-control behavior accepted in local visual verification`

## Active task

- [`docs/tasks/active/2026-08-27-pdf-cjk-rendering.md`](tasks/active/2026-08-27-pdf-cjk-rendering.md)：``waiting_user_acceptance``，等待用户验收未嵌入 Adobe CJK 字体 PDF 的真实 Reader 渲染。

## Implemented at the application baseline

- PDF 阅读、搜索、目录、缩略图、打印、批注和页面增删。
- PDF.js 构建资源按运行时请求路径平铺复制，未嵌入 Adobe CJK 字体的 PDF 可正常加载 CMap 并显示文字。
- 可填写 PDF 的表单内容只渲染一次，不再出现已复现的文字重影。
- Markdown 所见即所得/源码模式、显式保存、等宽代码字体、列表对齐和左侧目录。
- 标签切换、关闭、排序、拖出窗口和跨窗口停靠；标签拖动具有跨窗口跟随预览、释放点定位、标签页栏悬停抬升和可靠的原生 Z 序。
- 标签页显示 PDF、Markdown 或通用文件类型图标；同一标签栏中的标签页等宽，并在 `28px` 至 `220px` 范围内随可用标题栏空间自适应。空间收缩时先隐藏未选中标签的关闭按钮，文字自然被截断；极窄时选中标签保留关闭按钮，未选中标签保留类型图标。
- Windows 自定义标题栏、原生窗口按钮和 Snap Layout。
- 文件关联、拖放打开、单实例文件转发和上次会话恢复。

## Recorded automated verification

2026-08-24 在应用代码基线 `01c49f1` 上记录：

- Frontend tests: `89 passed`。
- Rust tests: `39 passed`。
- TypeScript/frontend production build: passed。
- `cargo fmt --check`: passed。
- `cargo clippy --all-targets --all-features -- -D warnings`: passed。
- Tauri release build: not rerun at this source baseline；最近一次通过记录和安装包仍来自 `1f5bb93`。

2026-08-27 针对用户提供的未嵌入 CJK 字体 PDF 记录：

- `pnpm --dir reader test`：11 个测试文件、89 个测试通过。
- `pnpm --dir reader build`：通过。
- 构建产物中的 PDF.js CMap、标准字体、WASM 和图片资源均位于运行时请求的平铺目录。
- Chromium 本地渲染同一 PDF：文字项可提取且中文标题、表格文字和照片可见；无警告或错误。

## Previous release artifacts

以下本地文件由应用代码基线 `1f5bb93` 生成，不纳入 Git，也不包含本次标签拖动修复；发布前必须基于当前源码重新构建并替换本节证据。

| Format | Repository-relative output | Size (bytes) | SHA-256 | Signature |
| --- | --- | ---: | --- | --- |
| NSIS | `reader/src-tauri/target/release/bundle/nsis/Reader_0.1.0_x64-setup.exe` | 15,895,941 | `5F1C74BA16AABACA97DB049CE4D86E2BEF2F194E74F77E423892559748B5857B` | `NotSigned` |
| MSI | `reader/src-tauri/target/release/bundle/msi/Reader_0.1.0_x64_en-US.msi` | 20,807,680 | `D5C7273EBD93B5C4C87C14BCE58ED19BF7F7312763C12E0232578E48142B323F` | `NotSigned` |

## Waiting for user acceptance

- Markdown 左侧目录、代码字体和列表对齐的最终视觉效果。
- 未嵌入 Adobe CJK 字体 PDF 修复在真实 Reader 桌面版本中的最终视觉效果。
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
