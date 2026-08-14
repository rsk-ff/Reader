# 轻量 PDF / Markdown 桌面阅读器技术方案

## 1. 产品定位

开发一个轻量、现代、以“直接打开文件”为核心的桌面阅读器。

产品定位接近：

**Acrobat Reader 的 PDF 能力 + Typora 的 Markdown 体验 + 浏览器式标签页。**

它不是：

- 文献管理器
- 笔记库
- 文件管理器
- IDE
- Electron 版浏览器

最核心的用户行为是：

```text
Explorer / Finder / 文件管理器
        ↓
双击 foo.pdf / bar.md
        ↓
立即显示内容
```

如果程序已经运行：

```text
双击另一个文件
        ↓
现有程序增加一个 Tab
        ↓
不新建第二个进程
不显示首页
不显示文件选择器
```

用户也可以把一个 Tab 拖出，形成独立窗口。

---

# 2. 第一原则

整个项目遵循以下原则。

### 2.1 启动速度优先

不要使用 Electron。

使用：

```text
Tauri 2
Rust backend
React + TypeScript frontend
```

Tauri 使用系统 WebView，而不是随应用打包整套 Chromium；其设计目标本身就是较小、快速的跨平台桌面应用。

PDF、Markdown 引擎必须按需加载：

```text
打开 MD
→ 不加载 PDF.js / PDFium

打开 PDF
→ 不加载 Milkdown
```

---

### 2.2 不重新实现成熟文档引擎

不要自己实现：

- PDF parser
- PDF renderer
- PDF text layer
- Markdown parser
- 富文本编辑器
- 打印系统

重点开发：

- Desktop shell
- Tab 系统
- Window 系统
- 文件生命周期
- PDF/MD adapter
- UI
- 性能缓存策略

---

# 3. 推荐技术栈

## Desktop

```text
Tauri 2
Rust
```

负责：

- 单实例
- 文件关联
- 文件读写
- PDFium
- 原子保存
- 多窗口
- Tab 跨窗口状态
- OS 打印
- 最近窗口状态
- crash recovery

Tauri 本身支持创建和管理多个窗口，窗口之间可以通过事件通信。

---

## Frontend

```text
React
TypeScript
Vite
Zustand
```

UI：

```text
Radix UI primitives
shadcn/ui source components
Tailwind CSS
Lucide Icons
```

Radix 和 shadcn/ui 都采用开放源码、可高度定制的组件模式，很适合做自己的视觉系统，而不是套一个“后台管理系统”主题。

不要让最终产品看起来像默认 shadcn。

它只是组件基础设施。

---

# 4. PDF 架构

采用：

```text
PDF.js
   +
PDFium
```

两者职责严格分开。

## PDF.js：阅读层

PDF.js 负责：

- PDF parsing
- 页面渲染
- 文本选择
- Text layer
- 搜索
- Outline
- Links
- 页面导航
- Zoom
- Fit width
- Fit page
- Thumbnail
- 打印准备
- 大 PDF 的按需页面渲染

PDF.js 是 Mozilla 维护的 Apache-2.0 PDF viewer，并且本身已经用于成熟浏览器 PDF 阅读场景。

第一阶段不要 fork PDF.js 核心。

优先：

```text
pdfjs-dist
```

必要时 vendoring：

```text
pdf.js/web
```

但所有修改都放在 adapter / theme 层，尽量保持上游代码可升级。

---

## PDFium：修改层

PDFium 负责：

- 读取 PDF annotations
- 创建 annotations
- 删除 annotations
- 更新 annotations
- 插入空白页
- 页面结构修改
- 最终 PDF save

PDFium 是 Chromium 使用的 PDF 引擎，其公开 embedding API 包含 annotation、document editing、page creation 和 saving。

例如 PDFium 官方 API 已直接提供：

```cpp
FPDFPage_New(...)
```

用于在指定 index 创建新 PDF 页面，以及：

```cpp
FPDF_SaveAsCopy(...)
```

保存修改后的 PDF。

Rust 层优先评估：

```text
pdfium-render
```

它已经为 PDFium 提供较成熟的 Rust 接口。

但是不要让业务层依赖 pdfium-render 的具体类型。

必须建立：

```text
PdfMutationBackend trait
```

如果 wrapper 某个 API 没覆盖，直接为 PDFium Public C API 写少量 FFI。

---

# 5. PDF 批注架构

不要完全依赖 PDF.js Annotation Editor。

原因：

PDF.js 已经能新增部分 annotation，但对保存后、或者来自其他软件的既有 annotation 再次编辑仍存在能力边界。

所以采用自己的 Annotation Model。

```ts
type PdfAnnotation = {
  id: string
  pageIndex: number

  type:
    | "highlight"
    | "underline"
    | "strikeout"
    | "note"
    | "freeText"
    | "ink"

  rect?: Rect
  quadPoints?: Quad[]
  inkPaths?: Point[][]

  color: string
  opacity: number

  text?: string

  createdAt?: string
  modifiedAt?: string
}
```

PDFium 原生 API 支持创建包括 FreeText、Highlight、Ink、Text、Underline、StrikeOut 等多种标准 annotation。

因此第一版支持：

```text
Highlight
Underline
Strikeout
Text Note
Free Text
Ink / Pen
```

---

## Annotation UI

PDF.js：

```text
canvas layer
text layer
```

上面增加自己的：

```text
annotation interaction layer
```

优先 SVG / DOM overlay，而不是把交互绘制进 PDF canvas。

结构：

```text
Page
├── PDF.js canvas
├── PDF.js textLayer
├── existing annotation rendering
└── Our AnnotationInteractionLayer
```

### Highlight

流程：

```text
用户选中文字
→ 获得 DOM Range rects
→ 转换到 PDF page coordinates
→ 生成 QuadPoints
→ annotation model
→ PDFium write
```

必须建立统一：

```ts
screenToPdf()
pdfToScreen()
```

不要在各 annotation tool 里单独处理 coordinate transform。

---

## 修改已有批注

如果 PDFium 对某类 annotation 缺少稳定的直接修改 API：

```text
读取旧 annotation
→ 修改 application model
→ remove old annotation
→ recreate annotation
```

对于无法安全修改的第三方 annotation：

```text
显示
但 readonly
```

绝不能损坏原 annotation。

---

# 6. PDF 空白页

提供：

```text
Insert Blank Page Before
Insert Blank Page After
```

默认页面尺寸：

```text
Same as current page
```

附加选项：

```text
A4
Letter
Custom
```

Backend：

```text
FPDFPage_New(document, pageIndex, width, height)
```

完成后重新生成 document revision。

不要为了增加一页重新构造整个 PDF 内容树。

---

# 7. PDF 保存机制

绝对不要直接修改原文件然后祈祷成功。

采用事务式保存：

```text
foo.pdf
   ↓
foo.pdf.tmp
   ↓
完整写入
   ↓
flush / fsync
   ↓
atomic replace
   ↓
foo.pdf
```

保存成功之前原文件保持完整。

DocumentSession：

```ts
{
  path
  dirty
  revision
  lastSavedRevision
}
```

Tab 中修改过文件：

```text
file.pdf ●
```

Ctrl+S：

```text
Save
```

关闭 dirty Tab：

```text
Save
Don't Save
Cancel
```

可以做 crash recovery，但 recovery 数据存 AppData，不要在 PDF 旁边到处产生 sidecar 文件。

---

# 8. PDF 打印

快捷键：

```text
Ctrl+P
Cmd+P
```

行为：

```text
PDF.js print preparation
        ↓
Tauri WebView print
        ↓
OS system print dialog
```

当前 Tauri 提供 WebView print command/permission，可以打开系统打印流程。

打印之前保证当前未保存 annotation / page mutation 已反映到待打印 document revision。

第一版不做：

```text
silent print
printer management
print queue management
```

只调用系统打印对话框。

---

# 9. 大 PDF 性能设计

必须针对：

```text
100 页
500 页
1000+ 页
```

PDF 优化。

禁止：

```text
打开文件
→ render every page
```

采用 viewport rendering。

默认只渲染：

```text
viewport
± 2~3 pages
```

离开较远页面：

```text
canvas bitmap
→ 可释放
```

但：

```text
document parser state
page position
zoom
selection
search state
annotation state
```

必须继续存在。

---

# 10. Tab 内存模型

这里尤其不要重复 Zotero 的问题。

**Tab ≠ DOM 页面。**

**Tab ≠ PDF document lifecycle。**

定义：

```text
DocumentSession
ViewerSession
WindowTab
```

三个独立概念。

```text
DocumentSession
├── path
├── document type
├── PDF parser state
├── annotations
├── dirty state
└── file revision

ViewerSession
├── scroll position
├── zoom
├── active page
├── sidebar state
└── selection

WindowTab
├── window
├── order
└── active/inactive
```

从一个 Tab 切换到另一个 Tab：

**不要 unmount PDF viewer。**

简单隐藏即可。

---

## Background tab cache

提供三个模式：

```text
Automatic
Keep Open Files Loaded
Memory Saver
```

默认：

```text
Automatic
```

Automatic 应该基于：

```text
RAM
process RSS
canvas cache size
last-used time
```

进行逐层释放。

优先释放：

```text
远端 page canvas
↓
thumbnail bitmap
↓
background render cache
```

最后才释放：

```text
整个 PDF DocumentSession
```

也就是说：

**绝不能因为“打开第四个 PDF”就固定 unload 第一个。**

---

# 11. Markdown 架构

使用：

```text
Milkdown
```

优先从：

```text
Milkdown Crepe
```

起步。

Milkdown 官方定位本身就是 plugin-driven WYSIWYG Markdown editor，并明确受到 Typora 启发，底层使用 ProseMirror + Remark，MIT License。

目标不是复制 Typora 每一个功能。

目标是：

```text
打开 .md
→ 直接是排版后的文章
→ 点击当前位置即可编辑
→ Markdown 标记只在需要时出现
```

---

# 12. Markdown 第一版支持

必须：

```text
CommonMark
GFM
Headings
Bold / Italic
Links
Images
Blockquotes
Ordered / unordered lists
Task lists
Tables
Fenced code
Inline code
Horizontal rule
Frontmatter
```

第二优先级：

```text
KaTeX math
Mermaid
Footnotes
```

---

# 13. Markdown 非标准语法策略

这是一个非常重要的设计。

Markdown 世界不存在一个能覆盖所有方言的 parser。

因此：

**未知语法不能被编辑器静默破坏。**

设计：

```text
Milkdown structured mode
+
CodeMirror source mode
```

快捷键：

```text
Ctrl+/
```

或者工具栏：

```text
Rendered | Source
```

如果遇到当前 parser 无法安全理解的 block：

建立：

```text
RawMarkdownNode
```

RawMarkdownNode 保存：

```ts
{
  originalSource: string
  startOffset: number
  endOffset: number
}
```

WYSIWYG 模式里可以显示成：

```text
Unsupported Markdown block
```

或者安全 preview。

但保存时必须保留：

```text
originalSource
```

不能把未知语法吃掉。

---

# 14. Markdown 数据完整性

这是硬性验收条件：

```text
打开 md
不做任何修改
关闭 / 保存
```

文件必须：

```text
byte-for-byte unchanged
```

不能因为 parser / serializer 导致：

```text
换行变化
列表缩进变化
frontmatter 格式变化
quote 风格变化
代码 fence 变化
```

只有用户实际修改文档以后，才允许修改源文件。

---

# 15. 系统文件关联

安装时注册：

```text
.pdf
.md
.markdown
```

Tauri bundler 已原生支持 file associations。

程序默认是 single-instance。

Windows/Linux：

```text
reader.exe "D:\books\a.pdf"
```

如果主进程存在：

```text
new process
→ forward argv
→ existing process
→ open_document(path)
→ exit temporary process
```

Tauri 官方 single-instance plugin 可以完成这一层。

macOS 使用：

```text
RunEvent::Opened
```

处理 Finder “Open With” / 双击文件；Tauri 已提供该 opened-file event。

---

# 16. OpenDocumentRouter

所有打开方式必须最终进入一个入口：

```rust
open_document(path)
```

包括：

```text
OS double click
Drag file into window
File → Open
CLI
Recent files
```

绝对不要出现五套 file-open 逻辑。

处理：

```text
canonicalize path
↓
检查是否已打开
↓
已打开：
   focus existing tab
未打开：
   create DocumentSession
   create tab
```

同一个文件不能无意中打开成多个彼此独立的 session。

---

# 17. Tab 系统

Tab 是产品核心能力。

视觉类似：

```text
┌──────────────────────────────────────────────────────────────┐
│ paper.pdf │ README.md ● │ spec.pdf │ +                  ─ □ ×│
├──────────────────────────────────────────────────────────────┤
│ document toolbar                                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                         content                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

支持：

```text
reorder
close
middle click close
Ctrl+W
Ctrl+Tab
Ctrl+Shift+Tab
pin（后续）
dirty indicator
```

---

# 18. Tab 拖出窗口

必须实现类似 Chrome / Edge：

```text
拖 Tab
↓
离开当前 tab strip
↓
产生新 native window
↓
Tab 转移到新 window
```

以及：

```text
拖到另一个 Reader window
↓
移动到该窗口
```

Backend 建立：

```rust
AppWorkspace {
    windows: HashMap<WindowId, WindowState>,
    documents: HashMap<DocumentId, DocumentSession>,
}
```

Tab 只是：

```text
window_id
document_id
viewer_state
position
```

而不是把文件所有状态绑死在某个 React component 上。

Tauri 支持运行时创建窗口以及窗口间事件通信，因此这一结构可直接建立在其 multi-window API 上。

拖出时：

```text
capture pointer
↓
检测离开 tab strip / window
↓
获取 global cursor position
↓
create new WebviewWindow
↓
transfer tab
↓
在 cursor 附近显示窗口
```

Tauri 提供窗口 cursor position 等 desktop API，可以用于这层实现。

---

# 19. UI 方向

关键词：

```text
quiet
dense
modern
native-like
content first
```

不要：

```text
Material Design 大按钮
巨型 toolbar
圆角卡片套卡片
渐变背景
Dashboard UI
```

参考视觉感觉：

```text
Linear
Arc
macOS Preview
现代 Firefox PDF viewer
Zed
```

但不直接复制任何一个。

---

# 20. Layout

Window chrome：

```text
Titlebar / Tabs
```

Tab row 与系统 titlebar 尽可能融合。

第二行只显示 context toolbar。

PDF：

```text
Sidebar
Page 12 / 438
Zoom
Fit width
Highlight
Pen
Text
Insert page
Search
Print
```

Markdown：

```text
Outline
Search
Source toggle
```

尽量不要一直显示几十个按钮。

低频功能进入：

```text
⋯
```

---

# 21. PDF Sidebar

左侧 Sidebar 三种模式：

```text
Thumbnails
Outline
Annotations
```

默认记住每个 document 上一次选择。

Sidebar 可以完全关闭。

---

# 22. Markdown 外观

Markdown 正文不是 IDE。

正文最大宽度：

```text
760~900px
```

支持：

```text
System
Light
Dark
```

字体：

```text
UI → system sans
正文 → system / configurable
Code → system monospace
```

代码 block 可以横向滚动。

表格不能把整个页面撑爆。

图片：

```text
max-width: 100%
```

Mermaid/Math 作为 document content 渲染，不作为网页 iframe。

---

# 23. 项目结构

建议：

```text
reader/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   └── router.ts
│   │
│   ├── workspace/
│   │   ├── tabs/
│   │   ├── windows/
│   │   └── document-session/
│   │
│   ├── documents/
│   │   ├── pdf/
│   │   │   ├── PdfViewer.tsx
│   │   │   ├── PdfToolbar.tsx
│   │   │   ├── PdfSidebar.tsx
│   │   │   ├── PdfAnnotationLayer.tsx
│   │   │   └── coordinates.ts
│   │   │
│   │   └── markdown/
│   │       ├── MarkdownEditor.tsx
│   │       ├── SourceEditor.tsx
│   │       └── markdown-plugins.ts
│   │
│   ├── components/
│   ├── styles/
│   └── stores/
│
├── src-tauri/
│   ├── src/
│   │   ├── main.rs
│   │   ├── workspace.rs
│   │   ├── open_document.rs
│   │   ├── file_watch.rs
│   │   ├── save.rs
│   │   │
│   │   └── pdf/
│   │       ├── mod.rs
│   │       ├── pdfium.rs
│   │       ├── annotation.rs
│   │       ├── page.rs
│   │       └── save.rs
│   │
│   └── tauri.conf.json
│
└── tests/
```

---

# 24. Rust API 边界

Frontend 不直接调用几十个 PDFium function。

提供高层 commands：

```rust
open_document()

save_document()

insert_blank_page()

get_annotations()

create_annotation()

update_annotation()

delete_annotation()

print_document()
```

例如：

```rust
#[tauri::command]
async fn insert_blank_page(
    document_id: String,
    after_page: usize
) -> Result<DocumentRevision>
```

所有 PDFium unsafe code 只能存在：

```text
src-tauri/src/pdf/
```

不能泄露到应用其他部分。

---

# 25. 外部文件修改

如果打开的文件被其他程序修改：

```text
filesystem watcher
↓
检测 mtime / file identity
```

如果当前文档未 dirty：

```text
自动 reload
```

如果当前有未保存修改：

```text
File changed on disk

Reload
Keep My Version
Save As
```

绝不能静默覆盖。

---

# 26. Session 恢复

软件异常退出：

重新启动后允许恢复：

```text
windows
tabs
file paths
scroll position
zoom
active page
```

但产品仍然以“双击文件直接打开”为核心。

恢复 session 不应该出现：

```text
Loading workspace...
```

阻塞用户当前双击打开的文件。

当前被双击的文件优先显示。

---

# 27. 性能目标

这些作为工程目标，而不是宣传 SLA。

### App

冷启动：

```text
尽量 < 700 ms
```

首屏 shell 不等待 PDF/Markdown engine 初始化。

---

### PDF

普通本地 100~500 页 PDF：

```text
只读取必要结构
首个可见页面优先
```

不得等待全文页面 render。

切换已经打开的 tab：

```text
目标视觉响应 < 100 ms
```

如果 canvas 已回收：

先显示：

```text
last rendered snapshot / placeholder
```

然后异步重绘。

不能白屏数秒。

---

### Markdown

小型 Markdown：

```text
双击后基本即时显示
```

大型 Markdown：

```text
parser 不阻塞 UI thread
```

必要时放 Web Worker。

---

# 28. 首版功能范围

## MVP 必须完成

PDF：

```text
open
continuous scroll
zoom
fit width
fit page
text selection
copy
search
outline
thumbnail
highlight
underline
strikeout
note
free text
ink
save
insert blank page
print
```

Markdown：

```text
open
Typora-like WYSIWYG
edit
save
GFM
table
task list
code
image
links
math
Mermaid
source mode
```

Shell：

```text
file association
double-click open
single instance
tabs
tab reorder
tab detach
multiple windows
drag tab between windows
dark/light/system
keyboard shortcuts
```

---

# 29. 明确暂不做

V1 不做：

```text
Cloud
Accounts
Sync
Zotero integration
OCR
PDF text editing
PDF page content editing
PDF merge UI
PDF split UI
Digital signature validation
AI
Chat with PDF
EPUB
DOCX
Plugin marketplace
Document library
Knowledge base
```

不要让 Agent scope creep。

---

# 30. 推荐实施顺序

## Phase 1 — Desktop shell

只做：

```text
Tauri
React
single instance
.pdf/.md association
open_document router
tabs
multi-window
```

用纯文本 placeholder 验证：

```text
双击 10 个文件
→ 都进入同一个窗口 10 个 tabs
```

之后才写 reader。

---

## Phase 2 — PDF 阅读

接 PDF.js。

先实现：

```text
render
scroll
zoom
search
outline
thumbnails
print
```

不做 annotation。

先验证 500+ 页 PDF 性能。

---

## Phase 3 — Markdown

接 Milkdown。

完成：

```text
WYSIWYG
source mode
save
GFM
math
Mermaid
```

验证：

```text
打开但不编辑
→ 文件 hash 完全不变
```

---

## Phase 4 — PDF annotation

实现：

```text
AnnotationModel
coordinate conversion
PDFium import/export
highlight
free text
ink
note
```

所有 annotation 必须写入标准 PDF。

用：

```text
Acrobat
Chrome
Firefox
Okular
```

重新打开验证批注仍然存在。

---

## Phase 5 — PDF page mutation

实现：

```text
insert blank page
transactional save
reload revision
```

再用第三方 reader 验证页结构。

---

## Phase 6 — Tabs / Windows polish

实现真正浏览器级：

```text
drag reorder
drag out
drag into other window
keyboard navigation
window restore
```

---

## Phase 7 — Performance

最后集中 profiling：

```text
startup
PDF render
tab switching
memory
many open documents
huge Markdown
```

不要过早做玄学优化。

---

# 31. 自动化测试重点

必须准备真实 fixture：

```text
10-page PDF
500-page PDF
1500-page PDF
encrypted PDF
annotated PDF
rotated page PDF
mixed page-size PDF
large image PDF

simple.md
gfm.md
math.md
mermaid.md
frontmatter.md
unknown-syntax.md
very-large.md
```

---

# 32. 核心验收测试

### Test 1

程序完全关闭。

双击：

```text
paper.pdf
```

结果：

```text
直接进入 paper.pdf
无首页
无文件选择器
```

---

### Test 2

paper.pdf 已打开。

双击：

```text
README.md
```

结果：

```text
同一个窗口出现第二个 Tab
不存在第二个 app process
```

---

### Test 3

连续打开：

```text
20 个 PDF
```

来回切换。

结果：

```text
不存在“第四个打开后第一个必须重新加载”的固定限制
```

---

### Test 4

打开：

```text
1000-page.pdf
```

结果：

```text
内存里没有 1000 个 full-resolution canvas
首屏无需等全部页面解析/render
```

---

### Test 5

PDF 中：

```text
highlight
free text
ink
```

保存。

退出程序。

用其他 PDF reader 打开。

结果：

```text
annotation 存在
```

---

### Test 6

插入一页 blank page。

保存。

用其他 PDF reader 打开。

结果：

```text
page count + 1
页面位置正确
```

---

### Test 7

打开复杂 Markdown。

不修改。

关闭。

结果：

```text
SHA256 before == SHA256 after
```

---

### Test 8

打开含未知 Markdown 方言语法文件。

修改普通 paragraph。

保存。

结果：

```text
未知语法仍原样存在
```

---

### Test 9

拖出 Tab。

结果：

```text
立即创建新窗口
原 Tab 消失
新窗口保持相同 scroll/page/zoom state
```

---

### Test 10

把 Tab 从新窗口拖回原窗口。

结果：

```text
DocumentSession 不重新创建
dirty state 不丢失
```

---

# 33. Open-source 复用原则

优先复用：

```text
Tauri
PDF.js
PDFium
pdfium-render
Milkdown
ProseMirror
Remark
CodeMirror
Radix UI
shadcn/ui
Lucide
```

不要 fork 一个完整现有 PDF Reader 然后大改 UI。

尤其避免：

```text
fork Okular
fork Xournal++
fork Zotero reader
```

因为会把项目绑定到它们的 UI 架构、许可证和历史设计。

本项目应该是：

```text
成熟 engine
+
薄 adapter
+
自己的 desktop UX
```

---

# 34. PDFium 二进制

开发阶段可以评估使用 `bblanchon/pdfium-binaries` 提供的预编译 PDFium，以避免 Agent 第一天就陷入 Chromium/PDFium 的大型构建链；该项目长期提供多平台预编译版本，但不是 Google 官方项目。

正式 release pipeline 应：

```text
pin exact PDFium version
pin SHA256
记录 license
自动安全更新
```

不要：

```text
download latest at runtime
```

---

# 35. Adapter 设计

必须确保以后可以：

```text
PDF.js → other renderer
PDFium → other mutation backend
Milkdown → other MD editor
```

而不用重写整个 app。

接口：

```ts
interface DocumentAdapter {
  open()
  save()
  close()

  getViewState()
  restoreViewState()

  isDirty()
}
```

PDF：

```text
PdfDocumentAdapter
```

Markdown：

```text
MarkdownDocumentAdapter
```

Tab 系统永远只认识：

```text
DocumentAdapter
```

---

# 36. 最重要的工程约束

如果实现过程中必须在：

```text
“功能更多”
```

和

```text
“打开文件更快”
```

之间选择：

始终选择后者。

如果必须在：

```text
“软件自动帮用户释放 RAM”
```

和

```text
“切换 Tab 时立即可读”
```

之间选择：

优先保证 Tab 切换体验，再根据真实 memory pressure 回收缓存。

这个产品存在的原因本身就是：

**让用户忘记自己正在使用一个阅读器。**

双击文件，内容就应该出现。