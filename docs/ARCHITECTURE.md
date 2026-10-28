# Architecture

## System overview

Reader 是 Tauri 2 桌面应用：React/TypeScript webview 负责界面和交互，Rust 后端负责应用生命周期、原生窗口、文件访问、工作区状态和 PDF 写操作。

```text
Windows / Tauri
├── Rust workspace and commands
│   ├── document sessions
│   ├── window/tab ownership
│   ├── reader-file range protocol
│   └── PDFium mutations and atomic writes
└── React webview
    ├── titlebar and tabs
    ├── PDF.js viewer
    ├── Milkdown Markdown editor
    └── Zustand workspace mirror
```

Rust 命令按领域分在 [`commands/`](../reader/src-tauri/src/commands/)：`mod.rs` 放工作区、标签与窗口生命周期命令和共享的 `broadcast`/`open_document`；`tab_drag.rs` 放标签拖动、停靠与拆出窗口；`markdown.rs` 放 Markdown 读写；`pdf.rs` 放批注、页面与保存。

## PDF path

- PDF.js 负责解析、渲染、文字层、批注层、搜索、链接、目录、缩略图、缩放和打印渲染；页面几何（尺寸、裁剪框、旋转、坐标变换）以 PDF.js `PageViewport` 为唯一来源。
- PDFium 只负责写操作：批注增删改、插入/删除页面和原子保存（见[决策 0001](decisions/0001-document-engine-split.md)）。
- 选字增强不改 PDF.js 依赖文件：[`pdfMarginSelection.ts`](../reader/src/documents/pdf/pdfMarginSelection.ts) 校正从行侧空白开始或越过首末行的拖动起止点；[`SelectionPreservingPdfViewer.ts`](../reader/src/documents/pdf/SelectionPreservingPdfViewer.ts) 在缩放和延迟重绘期间保存并恢复原生选区。复制、选区绘制仍由浏览器/PDF.js 负责。
- 异步 `reader-file` Range 协议只提供已在工作区打开的规范化 PDF 路径。每次加载使用唯一 `?rev=` 令牌，Rust 在令牌首次请求时固定源文件句柄；由于 PDFium 以改名替换写文件，同一次加载不会混读新旧字节。页面增删后前端递增令牌重新打开。
- PDFium 操作在阻塞线程上执行并由进程级锁串行化；工作副本创建、写入与标脏、保存提交和放弃修改都在同一把锁内完成，工作区锁只在记账时短暂持有。
- 删页使用原生 HTML `dialog` 模态，不依赖 Tauri `dialog.confirm` 权限。

主要代码：[`reader/src/documents/pdf/`](../reader/src/documents/pdf/)、[`reader/src-tauri/src/pdf/`](../reader/src-tauri/src/pdf/)、[`commands/pdf.rs`](../reader/src-tauri/src/commands/pdf.rs)。

## Markdown path

- Milkdown/Crepe 提供所见即所得编辑，`Ctrl+/` 切换源码模式；两种模式共享同一个内存 Markdown 字符串。
- [`MilkdownCrepe.tsx`](../reader/src/documents/markdown/MilkdownCrepe.tsx) 使用官方 common 样式与 Frame 浅色主题为基线，局部 `milkdownTheme.css` 只做字体、宽度和间距适配。Crepe 的 BlockEdit 与 Toolbar 被禁用，格式命令由右侧 `MarkdownTools` 通过命令桥调用。
- Crepe 实例只随组件挂载/卸载创建与销毁，编辑回传不替换实例，以保留焦点、选区和撤销历史；源码返回和放弃修改通过显式重挂载加载内容。异步创建/销毁串行化，旧实例不再发布修改。
- `flush()` 在保存和切换源码前补发实时内容，防止延迟监听漏掉刚输入的内容。保存使用临时文件加原子替换，并以修订号避免并发编辑被误标为已保存。
- 新插入的本地图片经 FileReader 内嵌为 data URL。文档中已有的图片地址由 Crepe `proxyDomURL` 经 [`markdownImages.ts`](../reader/src/documents/markdown/markdownImages.ts) 映射：相对路径按 .md 所在目录解析，绝对路径和 `file:` 地址原样取路径，都改走 `reader-image` 协议；`https:`、`data:`、`blob:` 原样加载。打印前对 `getHTML` 结果做同样替换。Markdown 源文本中的地址不变。
- 目录从标题模型生成；[`printMarkdown.ts`](../reader/src/documents/markdown/printMarkdown.ts) 用临时 Crepe 生成静态 HTML 并在隔离 iframe 中打印，不影响活动编辑器。
- 目录空白右键新建 Markdown：`NewMarkdownDialog` 收集文件名，`create_local_markdown` 在当前目录独占创建空文件后走普通打开流程。

主要代码：[`reader/src/documents/markdown/`](../reader/src/documents/markdown/)。

## Shared document UI

- `DocumentActions` 统一 PDF/Markdown 的打印/保存入口；`DocumentToolRail` 统一右侧竖栏。
- [`SidebarResizer`](../reader/src/components/SidebarResizer.tsx) 共用侧栏调宽与拖动收起逻辑（数值见 PRODUCT）；侧栏宽度和可见状态由各文档容器持有，不进入 Rust 工作区。

## Workspace, tabs and windows

- Rust 全局工作区拥有 `DocumentSession`、`WindowTab` 和每个窗口的标签顺序；前端 Zustand store 是其镜像。打开的规范化路径会去重。
- `WindowTab.document_id = None` 表示新标签页：它参与聚焦、排序、拖动和序列化；打开文件时活动新标签原位转换为文件标签，关闭最后一个标签时由工作区补位。
- 主窗口被关闭而拆出窗口仍在时，外部打开（单实例转发）投递到存活窗口；已打开的文件聚焦其所在窗口。
- 同一窗口内切换标签时组件保持挂载，以保留阅读器和编辑器状态。未保存 Markdown 不能跨 webview 迁移，因此相关跨窗口移动被阻止。
- 标签拖动：窗口内用 Pointer Events 和 React 预览；离开标题栏后改用不接收鼠标的原生预览窗口。Rust 监测器读取真实左键状态，按原生 Z 序命中目标标签栏，并用同步 `SetWindowPos` 管理 topmost 顺序。预览窗口不拥有标签，不参与持久化。
- 会话元数据保存在应用数据目录，普通启动不自动恢复。

主要代码：[`reader/src/workspace/`](../reader/src/workspace/)、[`TabStrip.tsx`](../reader/src/components/TabStrip.tsx)、[`tabPointerDrag.ts`](../reader/src/components/tabPointerDrag.ts)、[`workspace.rs`](../reader/src-tauri/src/workspace.rs)、[`lib.rs`](../reader/src-tauri/src/lib.rs)。

## New tab page and local files

- [`local_files.rs`](../reader/src-tauri/src/local_files.rs)：系统位置、本地磁盘（排除网络盘）和单层目录列表（只返回文件夹与 PDF/MD 的元数据，不读内容、不递归）；`create_local_markdown` 是唯一写操作，校验文件名并以 `create_new` 创建，不覆盖已有文件。
- [`cloud_locations.rs`](../reader/src-tauri/src/cloud_locations.rs)：只读发现 OneDrive/Dropbox 本机同步目录，要求客户端确实已安装且目录存在；不读凭据、不连接在线服务，结果只保存在内存。
- [`NewTabPage.tsx`](../reader/src/components/NewTabPage.tsx) 持有每个新标签的导航历史、筛选和目录结果，用请求序号丢弃过期响应，并负责“有效访问”计时。
- [`folderLocations.ts`](../reader/src/workspace/folderLocations.ts) 在 `localStorage` 的 `reader.folder-locations.v1` 保存固定项与常用文件夹统计，排序规则见[决策 0003](decisions/0003-frequent-folders.md)。
- 最近文件保存在 `localStorage` 的 `reader.recent-files.v1`，按规范路径去重、不设上限；加载时把 Windows `\\?\` 扩展长度路径迁移为普通路径。存储按应用标识和页面 origin 隔离，开发/检查版与正式版互不可见。

## Windows file associations and bundle

- [`brandIcons.ts`](../reader/src/components/brandIcons.ts) 与原生图标生成器共用同一套 SVG 母版（细节见 DEVELOPMENT 的 Icons 一节）。
- `tauri.conf.json` 声明 `.pdf`、`.md`、`.markdown` 关联；`bundle.resources` 携带两个文件 ICO 和第三方图标许可。
- NSIS（[`installer-hooks.nsh`](../reader/src-tauri/windows/installer-hooks.nsh)）和 WiX（[`file-association-icons.wxs`](../reader/src-tauri/windows/file-association-icons.wxs)）都同时为两套 ProgID 写 `DefaultIcon`，使 MSI/NSIS 交叉升级后生效的关联类仍能找到专用图标。

## Security boundary

- [`markdown_image.rs`](../reader/src-tauri/src/markdown_image.rs) 的 `reader-image` 协议只返回图片扩展名的文件，且规范化后的路径必须位于某个已打开 Markdown 文档所在目录或其子目录；单张上限 64 MB，SVG 响应附带禁止脚本的 CSP。CSP `img-src` 允许 `reader-image` 与 `https:`（用户决定网络图片直接加载，打开文档会访问图片所在服务器）。
- 生产 webview 使用 Content Security Policy。
- Markdown 文本读写命令 `read_file_text` / `save_file_text` 先规范化路径，只接受工作区中已打开、非未命名的 Markdown 文档；首次保存仍走 `save_markdown_document_as` 的独立校验。
- [`markdown_file.rs`](../reader/src-tauri/src/markdown_file.rs) 负责 Markdown 磁盘格式：读取时去掉 UTF-8 BOM、CRLF 归一为 LF 交给编辑器，并在 `DocumentSession.markdown_disk`（不序列化）记下 BOM、首个换行的风格和文件大小/修改时间；保存时按原格式写回。`save_file_text` 在大小或修改时间与记录不符时返回 `EXTERNAL_CHANGE:` 前缀错误，前端用应用内的 [`confirmDialog.tsx`](../reader/src/workspace/confirmDialog.tsx) 询问（默认焦点在“取消”，Esc 取消），确认后以 `overwrite: true` 重试；不用系统原生对话框，因为它在无边框窗口上会让鼠标指针消失、无法点击。非 UTF-8 文件给出中文错误，不做编码猜测。Milkdown 渲染模式保存时仍会按其序列化规则统一列表符号、强调和标题写法，这是已知限制；源码模式保存原样写回。
- 本地浏览命令只读取用户导航到的目录元数据，允许完整目录路径以支持此电脑浏览，不向 webview 返回任意文件内容；目录链接按需跟随，访问权限仍由操作系统决定。
- PDF Range 协议只接受 `GET`、`HEAD` 和 `OPTIONS`。
- 协议只提供已在 Rust 工作区打开的规范化 `.pdf` 路径，拒绝任意文件系统访问。
- 外部链接通过 `tauri-plugin-opener` 打开，capability 只允许 `http://`、`https://` 和 `mailto:` URL，不在应用 webview 内导航。`main.tsx` 在文档级冒泡阶段拦截所有未被处理的链接点击（PDF.js 等自行处理的链接先取消事件）：一律阻止 webview 导航，按原始 href 只放行绝对 web/mail 链接及补 https 的 `www.` 地址；可编辑正文中的链接需 Ctrl/Cmd+点击。`window.alert` 经 dialog 插件显示，capability 包含 `dialog:allow-message`。

## Decision records

架构选择的长期理由记录在 [`decisions/`](decisions/)。
