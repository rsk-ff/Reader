# Current status

- Last updated: 2026-08-29
- Application version: `0.1.0`
- Current application source baseline: `new-tab page, file actions, untitled Markdown, and normalized recent files accepted`

## Active task

- [`2026-08-29-pdf-outline-sidebar.md`](tasks/active/2026-08-29-pdf-outline-sidebar.md) — `waiting_user_acceptance`; PDF outline row layout and blank-page bookmark filtering are implemented and automatically verified.
- Latest completed task: [`2026-08-29-new-tab-page.md`](tasks/archive/2026-08-29-new-tab-page.md).

## Implemented at the application baseline

- PDF 阅读、搜索、按层级逐行显示并过滤空白页占位书签的目录、缩略图、打印、批注和页面增删。
- PDF.js 构建资源按运行时请求路径平铺复制，未嵌入 Adobe CJK 字体的 PDF 可正常加载 CMap 并显示文字。
- 可填写 PDF 的表单内容只渲染一次，不再出现已复现的文字重影。
- Markdown 所见即所得/源码模式、显式保存、等宽代码字体、列表对齐和左侧目录。
- 新标签页提供原生文件选择、无需预选位置的未命名 Markdown 创建和最多 8 项的跨启动最近文件列表。
- 标签切换、关闭、排序、拖出窗口和跨窗口停靠；标签拖动具有跨窗口跟随预览、释放点定位、标签页栏悬停抬升和可靠的原生 Z 序。
- 标签页显示 PDF、Markdown 或通用文件类型图标；同一标签栏中的标签页等宽，并在 `28px` 至 `220px` 范围内随可用标题栏空间自适应。空间收缩时先隐藏未选中标签的关闭按钮，文字自然被截断；极窄时选中标签保留关闭按钮，未选中标签保留类型图标。
- Windows 自定义标题栏、原生窗口按钮和 Snap Layout。
- 文件关联、拖放打开和单实例文件转发；会话元数据会保存，但普通启动不自动恢复上次文档。
- Windows 文件关联安装 PDF 与 Markdown 专用 ICO，并为 NSIS 和 MSI bundle 的两套关联类注册相应的 `DefaultIcon`。

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
- 用户于 2026-08-27 完成真实 Reader 桌面版本验收并确认无问题。

2026-08-27 针对标签对齐和 Windows 文件关联图标记录：

- `pnpm --dir reader test`：11 个测试文件、89 个测试通过。
- `pnpm --dir reader build`：通过。
- `cargo test --manifest-path reader/src-tauri/Cargo.toml`：39 个测试通过。
- `cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check`：通过。
- `cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`：通过。
- `pnpm --dir reader tauri build --bundles msi`：通过；WiX 反编译确认五个关联类的 `DefaultIcon` 分别指向 PDF 或 Markdown ICO。
- `pnpm --dir reader tauri build --bundles nsis`：通过；生成的 NSIS 脚本包含两个 ICO 资源、安装/卸载 hook 和资源清理。
- `reader/src-tauri/icons/file-pdf.ico` 与 `file-markdown.ico` 均包含 16、32、48、256 四个图像帧。

2026-08-29 针对“新标签页”记录：

- `pnpm --dir reader test`：11 个测试文件、89 个测试通过。
- `pnpm --dir reader build`：通过，1165 个模块完成生产构建。
- `cargo test --manifest-path reader/src-tauri/Cargo.toml`：41 个测试通过，其中新增覆盖最后标签补位、活动新标签文件复用及多个新标签序列化。
- `cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check`：通过。
- `cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`：通过。

2026-08-29 针对新标签页操作入口、未命名 Markdown 和最近文件修订记录：

- `pnpm --dir reader test`：14 个测试文件、97 个测试通过；新增覆盖最近文件、Windows 扩展长度路径迁移去重、Markdown 保存扩展名和取消首次保存时保留标签。
- `pnpm --dir reader build`：通过，1168 个模块完成生产构建；仅保留既有大 chunk 警告。
- `cargo test --manifest-path reader/src-tauri/Cargo.toml`：44 个测试通过；新增覆盖未命名 Markdown 创建、首次保存身份保持和保存目标约束。
- `cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check`：通过。
- `cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`：通过。

2026-08-29 针对 PDF 目录布局和空白页占位书签记录：

- 用户样本经 `pypdf` 验证包含 20 页、17 个原生书签，其中两个顶层 `空白页面` 书签分别指向第 2 页和第 4 页。
- `pnpm --dir reader test`：15 个测试文件、100 个测试通过；新增覆盖目录顺序、层级、占位标题规范化过滤及子项保留。
- `pnpm --dir reader build`：通过；仅保留既有大 chunk 警告。
- Rust 后端与打包未重跑：本次变更仅涉及前端 TypeScript、CSS、测试和文档。
- 真实 Reader 桌面视觉与交互验收待用户完成。

## Latest local release artifacts

以下本地文件由本次源码变更生成，不纳入 Git；本轮安装、升级、卸载和资源管理器图标已由用户完成验收。

| Format | Repository-relative output | Size (bytes) | SHA-256 | Signature |
| --- | --- | ---: | --- | --- |
| NSIS | `reader/src-tauri/target/release/bundle/nsis/Reader_0.1.0_x64-setup.exe` | 15,899,628 | `4561FBAF911094F8B9C2FC754D23EC8EBD0DF95B732732B84C215CE4BB0FB10B` | `NotSigned` |
| MSI | `reader/src-tauri/target/release/bundle/msi/Reader_0.1.0_x64_en-US.msi` | 20,815,872 | `2E8EA7C3A66EBADA7DA089D910F02F91E427211DA9D863707925312389D766AD` | `NotSigned` |

## Latest user acceptance

- 2026-08-29：用户验收新标签页、原生打开文件、延迟到首次保存时选路径的新建 Markdown，以及最近文件 Windows 路径清理和去重结果。
- 2026-08-27：用户确认标签文件名左对齐、PDF/MD 文件专用图标以及 `0.1.0` 安装包结果可以验收。

## Known limitations

- 只有当前会话中由应用创建且接入自定义覆盖层的批注支持双击删除。
- PDF 修改立即写入文件；关闭文档不能回滚这些写操作。
- 标签跨原生窗口移动不会迁移前端滚动、缩放等瞬时状态；未保存 Markdown 的跨窗口移动被阻止。
- 未保存 Markdown 没有崩溃恢复 sidecar。
- 打印会顺序渲染所有页面，对超大文档尚未优化。
- Milkdown 编辑器虽然延迟加载，仍会产生约 1.5 MB 的压缩 chunk。
- 当前发布目标为 Windows，安装包没有代码签名，可能触发 SmartScreen 提示。
