# Current status

- Last updated: 2026-10-05
- Application version: `0.1.0`
- Latest user-accepted application source baseline: `87f488e — Markdown editing stability and selection-induced page shift fixes accepted`

## Active task

- [`2026-10-05-pdf-margin-selection.md`](tasks/active/2026-10-05-pdf-margin-selection.md) — `waiting_user_acceptance`; PDF 从文字行空白处开始拖动选择已修复，全量自动化验证通过，独立开发窗口已启动，待用户检查原问题 PDF。
- [`2026-08-29-pdf-outline-sidebar.md`](tasks/active/2026-08-29-pdf-outline-sidebar.md) — `waiting_user_acceptance`; PDF outline row layout and blank-page bookmark filtering are implemented and automatically verified.
- Latest completed task: [`2026-10-03-markdown-editing-stability.md`](tasks/archive/2026-10-03-markdown-editing-stability.md).

## Implemented at the application baseline

- PDF 阅读、搜索、按层级逐行显示并过滤空白页占位书签的目录、缩略图、打印、批注和页面增删。
- PDF.js 构建资源按运行时请求路径平铺复制，未嵌入 Adobe CJK 字体的 PDF 可正常加载 CMap 并显示文字。
- 可填写 PDF 的表单内容只渲染一次，不再出现已复现的文字重影。
- Markdown 所见即所得/源码模式、显式保存、等宽代码字体和左侧目录；渲染区域采用 Crepe 官方完整 Frame 浅色主题。
- 新标签页提供原生文件选择、无需预选位置的未命名 Markdown 创建和最多 8 项的跨启动最近文件列表。
- 标签切换、关闭、排序、拖出窗口和跨窗口停靠；标签拖动具有跨窗口跟随预览、释放点定位、标签页栏悬停抬升和可靠的原生 Z 序。
- 标签页显示 PDF、Markdown 或通用文件类型图标；同一标签栏中的标签页等宽，并在 `28px` 至 `220px` 范围内随可用标题栏空间自适应。空间收缩时先隐藏未选中标签的关闭按钮，文字自然被截断；极窄时选中标签保留关闭按钮，未选中标签保留类型图标。
- Windows 自定义标题栏、原生窗口按钮和 Snap Layout。
- 文件关联、拖放打开和单实例文件转发；会话元数据会保存，但普通启动不自动恢复上次文档。
- Windows 文件关联安装 PDF 与 Markdown 专用 ICO，并为 NSIS 和 MSI bundle 的两套关联类注册相应的 `DefaultIcon`。

## Recorded automated verification

2026-10-05 针对 PDF 空白起点选字记录：

- 修复前真实 Edge 测试复现左侧空白起点产生空选区，而文字内部拖动正常；仅启用文字层选择仍漏首字，因此加入局部起点校正。
- `pnpm --dir reader test`：16 个文件、108 项测试通过。
- `pnpm --dir reader test:browser`：17 项真实 Edge 功能测试通过，含新增 8 项 PDF 回归，覆盖左右空白起点、文字内部、反向、重选、空白单击取消、跨行、缩放/滚动及高亮 quads；PDF.js/React/CSS 真实运行，文件协议与批注写入模拟，无截图、视频或 trace。
- `pnpm --dir reader build`：TypeScript 与生产构建通过，1171 个模块；仅既有大 chunk 警告。
- 文档和 diff 检查通过；Tauri 开发编译完成，通过临时独立应用标识启动验收窗口并打开文字 PDF 样本副本。纠正 pnpm 启动示例的分隔符，直接 Tauri CLI 启动已验证文件参数正确。
- 原问题 PDF 的真实 WebView2 交互待用户验收；本次未改 Rust，Rust 测试和安装包未重跑。

2026-10-03 针对 Markdown 编辑稳定性记录：

- 原实现的生命周期回归测试复现每次编辑重建、重复选择 Rendered 重建、过期回调及重复销毁。
- `pnpm --dir reader test`：16 个文件、108 项测试通过，新增 8 项 React 组件回归；Crepe/Tauri 边界使用模拟实现，未据此声称真实输入法或编辑器交互通过。
- `pnpm --dir reader test:browser`：9 项真实 Edge 浏览器功能测试通过，覆盖 H1–H6 开头文档的选区切换、中部滚动选字、普通标题间距和实际编辑器的连续输入/撤销/重做。旧首标题样式实测选择后向上移动 35px，修复后坐标与滚动位置保持不变。无截图或桌面视觉验收。
- `pnpm --dir reader build`：TypeScript 与生产构建通过，1170 个模块；仅既有大 chunk 警告。
- 文档与 diff 检查通过；Tauri 开发编译完成，独立验收窗口已启动并传入临时 Markdown 样本。
- 选区跳动修复后再次通过 108 项前端测试与生产构建；用户于 2026-10-03 确认验收通过。Rust 测试和安装包本轮未重跑。源码/所见即所得切换仍不保留跨模式撤销历史。

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

2026-08-29 针对 Markdown 官方主题整合记录：

- `pnpm --dir reader test`：15 个测试文件、100 个测试通过。
- `pnpm --dir reader build`：TypeScript 与生产构建通过；仅保留既有大 chunk 警告。
- 构建后的 Markdown CSS 包确认包含 Frame 主题、官方列表/表格样式和本地代码字体，不再包含 `markdown-body` 或远程 CSS 导入。
- `scripts/check-docs.ps1` 与 `git diff --check`：通过。
- 开发版 Reader 已启动并传入排版样本的临时副本；视觉、交互及实际问题文档仍待用户验收。本次未改 Rust 或生成新安装包。

2026-08-30 针对 Markdown 视觉反馈修订记录：

- H1/H2/H3 调整为 28/24/20px（正文基准 16px），H4–H6 统一为 16px 粗体；标题语义和目录模型不变。
- 禁用 Crepe BlockEdit，移除左侧加号/点阵及其斜杠菜单；仅上调展开状态的 CodeMirror 折叠标记，折叠实现不变。
- `pnpm --dir reader test`：15 个测试文件、100 个测试通过。
- `pnpm --dir reader build`：TypeScript 与生产构建通过，1170 个模块；仅保留既有大 chunk 警告。
- Vite 已热更新当前 Reader 窗口，两个相关模块返回 200 且包含最新修改；本次热更新未记录新的前端初始化错误。视觉及交互复验待用户完成，Rust 与安装包未重跑。

## Latest local release artifacts

以下本地文件不纳入 Git。MSI 已于 2026-08-30 从应用源码 `6097a1c` 重新构建，版本仍为 `0.1.0`；NSIS 为历史产物，本轮未重建。此前安装包的验收不代表新 MSI 的安装结果。

| Format | Build scope | Repository-relative output | Size (bytes) | SHA-256 | Signature |
| --- | --- | --- | ---: | --- | --- |
| NSIS | 历史产物，未重建 | `reader/src-tauri/target/release/bundle/nsis/Reader_0.1.0_x64-setup.exe` | 15,899,628 | `4561FBAF911094F8B9C2FC754D23EC8EBD0DF95B732732B84C215CE4BB0FB10B` | `NotSigned` |
| MSI | 2026-08-30 / `6097a1c` | `reader/src-tauri/target/release/bundle/msi/Reader_0.1.0_x64_en-US.msi` | 20,983,808 | `631D97DF32D21EC6D3671A5705928F9F22525CA0E5953AF2C77DD0D94D120F0B` | `NotSigned` |

本次 MSI 构建与启动证据：

- `pnpm --dir reader tauri build --bundles msi`：退出码 `0`；前端 1170 个模块、Rust release 与 WiX candle/light 均完成，仅保留既有前端大 chunk 警告。构建日志为 `reader/msi-build-20260830.log`。
- MSI 数据库：`ProductVersion=0.1.0`、`ALLUSERS=1`、`ProductCode={F234FE2F-E737-45B3-8DB4-D7EDEC3B0A62}`；UpgradeCode 保持 `{8C88C1AD-4BA2-5A3C-9E5F-45B76A862470}`，升级表最小版本 `0`、无最大版本、属性 `257`，覆盖现有同版本 MSI。
- 包内含 `reader.exe`、`pdfium.dll`、PDF/Markdown ICO；注册表表中五项 `DefaultIcon` 均指向相应 ICO。
- 已通过 `msiexec /i` 运行安装，日志确认 `Installation completed successfully`、退出码 `0`；新 ProductCode 已注册，旧 MSI ProductCode `{6D5BCA1C-BFAB-45DA-9DBD-C78032EFE4E9}` 的卸载记录已移除。日志位于 `C:\Users\fanq1\AppData\Local\Temp\Reader-MSI-Install-20260830-2259.log`；未主动卸载原 NSIS 安装，本轮未测试卸载。
- 安装目录为 `C:\Users\fanq1\AppData\Local\Reader`。安装后的 `reader.exe` 与本次 release 二进制等长，逐字节比较仅 `__TAURI_BUNDLE_TYPE_VAR_UNK` → `__TAURI_BUNDLE_TYPE_VAR_MSI` 的三字节不同，其余内容一致；这是 Tauri 打包标记，不是保留旧程序。已启动安装后的 Reader，安装版视觉结果未单独复验。
- 本轮仅归档文档和重新打包，未改应用源码；不重复运行先前已通过的前端单元测试及 Rust 测试套件。

## Latest user acceptance

- 2026-10-03：用户确认 Markdown 编辑稳定性与选区跳动修复验收通过，源码基线为 `87f488e`；任务已归档，未生成新安装包。
- 2026-08-30：用户验收 Markdown 官方主题及标题、块控件和代码折叠箭头修订，并要求生成和运行新的 MSI 安装包。
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
