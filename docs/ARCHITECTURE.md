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

## PDF path

- PDF.js 负责解析、页面渲染、文字层、批注层、搜索、链接、目录、缩略图、缩放和打印渲染。
- PDF 文字层启用原生文字选择；`pdfMarginSelection.ts` 在页面空白处按下时定位同一行最近的文字边缘，文字内部按下时记录浏览器原生起点，在本次拖动期间保持该起点。终点仍由浏览器命中文字；仅当指针落在 PDF 文字层空白时校正到当前行的边缘，向下越过末行时取行尾，反向越过首行时取行首，同一行的邻接字体片段按引擎 DOM 顺序合并并在显式换行处停止。`pointermove` 后的延迟校正处理原生 caret 没变、未发 selectionchange 的情况，`pointerup` 捕获阶段校正后供文字批注读取原生 Range。浏览器/PDF.js 继续负责复制、选区绘制和几何；链接、表单和绘图覆盖层不参与校正。非活动标签、卸载、释放、取消和失焦清理拖动状态与定时器。
- `SelectionPreservingPdfViewer.ts` 在 PDF.js 的公开缩放入口内保留原生选区，其他操作继续使用引擎原有的清选行为。缩放前记录文字 span 内的字符偏移及选区覆盖的文字层，缩放及 `textlayerrendered` 后按当前节点恢复；这处理搜索高亮对文字子节点的替换，并保留反向选区。缩放和延迟 `refresh` 后用 PDF.js 的新 viewport 立即更新已选页面的缓存文字层，避免画布重绘期间隐藏文字使复制失效；画布仍延迟重绘，选区仍由浏览器/PDF.js 绘制。所有选中页面完成引擎文字层重绘后释放快照，无关页面事件不提前释放。新指针操作、非缩放按键、失焦或普通清选取消待恢复状态，卸载时解除监听；不改 PDF.js 依赖文件。
- Rust 的异步 `reader-file` Range 协议向 PDF.js 提供带修订号的字节流，只允许访问已在工作区打开的规范化 PDF 路径。
- 页面尺寸、裁剪框、旋转和 PDF 到视口的坐标变换以 PDF.js `PageViewport` 为唯一几何来源。
- PDFium 只负责写操作：批注增删改、插入空白页、删除页面和原子保存。
- PDFium 操作在阻塞线程上执行，并通过进程级锁串行化。写入成功后递增文档修订号，使 PDF.js 重新打开最新文件。

主要代码：

- [`reader/src/documents/pdf/`](../reader/src/documents/pdf/)
- [`reader/src-tauri/src/pdf/`](../reader/src-tauri/src/pdf/)
- [`reader/src-tauri/src/commands.rs`](../reader/src-tauri/src/commands.rs)

## Markdown path

- Milkdown/Crepe 提供所见即所得编辑，源码模式通过 `Ctrl+/` 切换。
- `MilkdownCrepe.tsx` 按顺序导入官方 common 样式、Frame 浅色主题和局部 `milkdownTheme.css`。官方样式是正文、列表、表格和编辑控件的基线；局部适配负责字体、文档宽度/边距、紧凑标题、引用/代码/公式间距和代码折叠标记对齐，不混用 GitHub Markdown CSS。`Crepe.Feature.BlockEdit` 与 `Toolbar` 被禁用，块控件及选字格式浮层不挂载；`MarkdownTools` 通过挂载后注册的命令桥操作当前编辑器，保留选区、格式命令、撤销与 CodeMirror 折叠。外置命令覆盖行内与常用块结构，图标采用同一 Bootstrap SVG 集合；遮罩地址使用带引号的 CSS url，兼容 Vite 内联 SVG data URL 中的单引号。命令的内容即时回传，监听器按最后已发布文本去重；`flush()` 在保存/切换源码前补发实时内容，保留初始化不变脏和修订号保护，避免输入或图片属性更新的延迟通知造成内容丢失。
- 两种模式共享同一个内存 Markdown 字符串。
- ImageBlock 的本地上传经 FileReader 生成内嵌 data URL，使用既有图片 schema 和原子保存，不引入文件协议/权限或外部存储；避免 Crepe 默认临时 blob URL 无法跨启动读取。
- Crepe 实例只随组件挂载/卸载创建与销毁；编辑内容回传不替换实例，以保留焦点、选区和撤销历史。源码返回及放弃修改通过父组件的显式重挂载加载内容，重复选择当前模式不重置编辑器。异步创建和销毁串行化，旧实例不再向当前文档发布修改。
- 首个标题的顶部间距按首个文档内容元素判断，排除 ProseMirror widget 和虚拟光标；选区变化会增删这些装饰节点，不能直接使用 `:first-child` 判断首个标题。
- 保存使用临时文件、刷新和原子替换；保存过程使用修订号，避免并发编辑被错误标记为已保存。
- 新建 Markdown 先由 Rust 工作区创建 `untitled` 内存文档（空路径、稳定文档 ID），首次保存时前端才调用原生保存对话框；Rust 在原子写入成功后为同一文档和标签绑定规范化路径。
- Markdown 目录从标题模型生成，并驱动源码或渲染视图导航。
- `printMarkdown.ts` 用独立临时 Crepe 解析打印快照，通过 `getHTML` 生成静态正文，再在隔离 iframe 中打印；保留 CodeMirror 以满足 LaTeX 依赖，打印 HTML 不含编辑控件。渲染模式直接读取活动编辑器避免监听延迟，源码模式读取工作文本；临时解析器销毁，打印后移除 iframe 并恢复焦点，不替换活动编辑器或调用保存。
- `DocumentActions` 统一 PDF/Markdown 输出入口；`DocumentToolRail` 统一右侧竖栏。`PdfTools` 只调用既有批注与页面操作回调。
- [`SidebarResizer`](../reader/src/components/SidebarResizer.tsx) 共用 PDF/Markdown 的 168–560px 调宽边界、84px 拖动收起阈值、指针捕获清理及键盘调宽。分隔条记录拖动起点与展开偏好宽度，按未截断累计位移判断收起；侧栏宽度/可见状态仍由各文档容器持有，不进入 Rust 工作区或文档内容。Markdown 的 ResizeObserver 只限制显示宽度，收起/展开及窗口放宽后保留原偏好。
- PDF 删页使用原生 HTML `dialog` 模态与页码快照，避免 `window.confirm` 经 Tauri 注入后要求未授予的 `dialog.confirm` 权限；取消不调用变更命令，确认后仍使用既有 PDFium 删页路径。

主要代码：

- [`reader/src/documents/markdown/`](../reader/src/documents/markdown/)

## Workspace, tabs and windows

- Rust 全局工作区拥有 `DocumentSession`、`WindowTab` 和每个窗口的标签顺序；`WindowTab.document_id = None` 表示不绑定文件但仍参与聚焦、排序、拖动和序列化的真实新标签页。
- 打开的规范化路径会去重；前端 Zustand store 是 Rust 工作区的镜像。
- 无文件启动时 Rust 为主窗口创建新标签；关闭主窗口最后一个标签会由工作区模型立即补位。打开文件时若目标窗口的活动标签是新标签，则原位转换为文件标签。
- 新标签页的打开/首次保存位置由 Tauri dialog plugin 提供原生对话框，能力限定为 `open` 与 `save`；文件读取和原子写入仍由 Rust 命令执行。
- 最近文件由前端工作区层维护在 webview `localStorage`，只记录成功打开或首次保存后的规范文件，不记录未命名文档；列表按最近使用去重，不设条数上限；v1 加载使用按规范路径索引的 Map 保持最新记录顺序，并从较旧重复记录补齐缺少的元数据，避免重复复制整个列表。记录可选 `opened_at`（本地成功打开的 epoch 毫秒）和 `file_size`（已有工作区元数据），保持 v1 存储键并兼容旧记录；快照更新大小不改变打开时间或列表顺序，首次保存建立文件记录。大小是已有快照缓存，不主动轮询磁盘或检测外部修改。Windows `\\?\` / `\\?\UNC\` 扩展长度前缀在身份比较和显示前转换为普通盘符或 UNC 路径，加载旧记录时同步迁移并合并重复项。
- 同一窗口内切换标签时组件保持挂载，从而保留阅读器和编辑器状态。
- 标签使用 Pointer Events 在同一窗口内排序；拖动时先由 React 显示标签预览，离开来源标题栏后改用忽略鼠标事件的短生命周期原生预览窗口，使反馈能跨出 webview 边界。
- Rust 拖动监测器在 Windows 上读取真实左键状态；单标签原生窗口移动在鼠标释放时完成停靠检测，不依赖 `startDragging()` Promise 的完成时序。
- 拖动进入可见 Reader 窗口的标签页栏时，监测器按 Windows 原生 Z 序选择最上层命中窗口并临时置顶；多标签来源窗口也参与命中，因此返回来源标签页栏可重新抬升来源。经过文档内容区不触发上浮，离开、取消、超时或完成后撤销。
- Windows 拖动会话通过同步 `SetWindowPos` 依次把目标、跨窗口原生标签预览或随鼠标移动的单标签来源窗口放入 topmost 层，保证拖动载体最后进入且不被目标遮挡；不使用 TAO 的异步 `always_on_top` 状态更新。释放时命中目标标签页栏则移动标签，否则多标签来源按释放点创建新窗口。
- 拖动预览窗口不拥有工作区标签，不参与会话持久化和窗口销毁广播。
- 未保存 Markdown 的编辑状态无法在 webview 间安全迁移，因此相关移动被阻止。
- 会话元数据保存在应用数据目录供潜在恢复使用；当前普通启动明确不自动恢复旧会话。

主要代码：

- [`reader/src/workspace/`](../reader/src/workspace/)
- [`reader/src/components/TabStrip.tsx`](../reader/src/components/TabStrip.tsx)
- [`reader/src/components/tabPointerDrag.ts`](../reader/src/components/tabPointerDrag.ts)
- [`reader/src/components/WindowTitleBar.tsx`](../reader/src/components/WindowTitleBar.tsx)
- [`reader/src-tauri/src/commands.rs`](../reader/src-tauri/src/commands.rs)
- [`reader/src-tauri/src/workspace.rs`](../reader/src-tauri/src/workspace.rs)
- [`reader/src-tauri/src/lib.rs`](../reader/src-tauri/src/lib.rs)

## Windows file associations and bundle

- [`brandIcons.ts`](../reader/src/components/brandIcons.ts) 将软件/PDF/Markdown/通用文件 SVG 母版映射到应用组件；标题栏、首页、标签、最近记录及两种拖拽预览共用此入口。原生图标生成器读取同一软件/PDF/Markdown 母版，HTML favicon 读取软件母版，避免维护第二套设计。
- 文件母版的 UI 画布保持 22×22，列表和标签分别选择显示尺寸；原生生成器在临时副本中仅将外围裁为居中的 viewBox `2 2 18 18` 后转换 ICO。选定的 Material Icon Theme PDF 和 Material Design Icons Markdown 原路径不变，最长可见维度统一为 16 单位、保持宽高比；同一母版加入不透明白色背衬与同饱和度/明度红蓝配色，同时供 UI 和原生使用。软件图标转换不变。
- `reader/src-tauri/tauri.conf.json` 声明 `.pdf`、`.md` 和 `.markdown` 的打开关联；通用关联定义继续由 Tauri 生成。
- `bundle.resources` 将 `file-pdf.ico` 与 `file-markdown.ico` 放入安装目录，使注册表中的 `DefaultIcon` 在安装后保持有效。
- `bundle.resources` 携带 Fluent Emoji、Bootstrap Icons、Material Icon Theme、Pictogrammers 的版权/许可、Apache 2.0 全文和文件图标修改 notice 至 licenses 目录。
- NSIS 通过 [`installer-hooks.nsh`](../reader/src-tauri/windows/installer-hooks.nsh) 在 Tauri 关联创建后为 `PDF Document`、`Markdown Document` 以及 WiX 使用的 `Reader.*` ProgID 覆写 `DefaultIcon`，卸载后通知 Windows 刷新关联。
- WiX 通过 [`file-association-icons.wxs`](../reader/src-tauri/windows/file-association-icons.wxs) 为 `Reader.pdf`、`Reader.md`、`Reader.markdown` 及 NSIS 使用的 `PDF Document`、`Markdown Document` 添加注册表组件；组件随 MSI 卸载而移除。双集合是为了让 MSI/NSIS 交叉升级时，当前生效的关联类仍能找到专用图标。

主要代码和资源：

- [`reader/src-tauri/tauri.conf.json`](../reader/src-tauri/tauri.conf.json)
- [`reader/src-tauri/windows/`](../reader/src-tauri/windows/)
- [`reader/src-tauri/icons/file-pdf.ico`](../reader/src-tauri/icons/file-pdf.ico)
- [`reader/src-tauri/icons/file-markdown.ico`](../reader/src-tauri/icons/file-markdown.ico)

## Security boundary

- 生产 webview 使用 Content Security Policy。
- PDF Range 协议只接受 `GET`、`HEAD` 和 `OPTIONS`。
- 协议只提供已在 Rust 工作区打开的规范化 `.pdf` 路径，拒绝任意文件系统访问。
- 外部链接通过受控 opener 打开，不在应用 webview 内导航。

## Decision records

架构选择的长期理由记录在 [`decisions/`](decisions/)；PDF 双引擎边界见 [`0001-document-engine-split.md`](decisions/0001-document-engine-split.md)。原始设想保存在 [`archive/`](archive/)，但不作为当前实现依据。
