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
- 两种模式共享同一个内存 Markdown 字符串。
- 保存使用临时文件、刷新和原子替换；保存过程使用修订号，避免并发编辑被错误标记为已保存。
- Markdown 目录从标题模型生成，并驱动源码或渲染视图导航。

主要代码：

- [`reader/src/documents/markdown/`](../reader/src/documents/markdown/)

## Workspace, tabs and windows

- Rust 全局工作区拥有 `DocumentSession`、`WindowTab` 和每个窗口的标签顺序。
- 打开的规范化路径会去重；前端 Zustand store 是 Rust 工作区的镜像。
- 同一窗口内切换标签时组件保持挂载，从而保留阅读器和编辑器状态。
- 标签使用 Pointer Events 在同一窗口内排序；拖动时先由 React 显示标签预览，离开来源标题栏后改用忽略鼠标事件的短生命周期原生预览窗口，使反馈能跨出 webview 边界。
- Rust 拖动监测器在 Windows 上读取真实左键状态；单标签原生窗口移动在鼠标释放时完成停靠检测，不依赖 `startDragging()` Promise 的完成时序。
- 拖动进入可见 Reader 窗口的标签页栏时，监测器按 Windows 原生 Z 序选择最上层命中窗口并临时置顶；多标签来源窗口也参与命中，因此返回来源标签页栏可重新抬升来源。经过文档内容区不触发上浮，离开、取消、超时或完成后撤销。
- Windows 拖动会话通过同步 `SetWindowPos` 依次把目标、跨窗口原生标签预览或随鼠标移动的单标签来源窗口放入 topmost 层，保证拖动载体最后进入且不被目标遮挡；不使用 TAO 的异步 `always_on_top` 状态更新。释放时命中目标标签页栏则移动标签，否则多标签来源按释放点创建新窗口。
- 拖动预览窗口不拥有工作区标签，不参与会话持久化和窗口销毁广播。
- 未保存 Markdown 的编辑状态无法在 webview 间安全迁移，因此相关移动被阻止。
- 会话元数据保存在应用数据目录，并在启动时恢复。

主要代码：

- [`reader/src/workspace/`](../reader/src/workspace/)
- [`reader/src/components/TabStrip.tsx`](../reader/src/components/TabStrip.tsx)
- [`reader/src/components/tabPointerDrag.ts`](../reader/src/components/tabPointerDrag.ts)
- [`reader/src/components/WindowTitleBar.tsx`](../reader/src/components/WindowTitleBar.tsx)
- [`reader/src-tauri/src/commands.rs`](../reader/src-tauri/src/commands.rs)
- [`reader/src-tauri/src/workspace.rs`](../reader/src-tauri/src/workspace.rs)
- [`reader/src-tauri/src/lib.rs`](../reader/src-tauri/src/lib.rs)

## Security boundary

- 生产 webview 使用 Content Security Policy。
- PDF Range 协议只接受 `GET`、`HEAD` 和 `OPTIONS`。
- 协议只提供已在 Rust 工作区打开的规范化 `.pdf` 路径，拒绝任意文件系统访问。
- 外部链接通过受控 opener 打开，不在应用 webview 内导航。

## Decision records

架构选择的长期理由记录在 [`decisions/`](decisions/)；PDF 双引擎边界见 [`0001-document-engine-split.md`](decisions/0001-document-engine-split.md)。原始设想保存在 [`archive/`](archive/)，但不作为当前实现依据。
