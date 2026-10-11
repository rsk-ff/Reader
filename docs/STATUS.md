# Current status

- Last updated: 2026-10-10
- Application version: `0.1.0`
- Latest user-accepted application source baseline: `b2c1553 — Markdown resize and PDF/Markdown drag-to-collapse accepted`

## Active task

- [`2026-10-10-local-file-home.md`](tasks/active/2026-10-10-local-file-home.md) — `waiting_user_acceptance`; 新标签页本地文件浏览/固定与常用文件夹已实现，115 项前端、46 项 Rust、9 项浏览器及类型/构建/静态检查通过；独立检查窗口已启动，实际布局与交互待用户。

- [`2026-10-07-icon-consistency.md`](tasks/active/2026-10-07-icon-consistency.md) — `waiting_user_acceptance`; 用户选定 PDF B / MD D 与同饱和度配色，源码 d7c2aab 已正式构建/安装/刷新/清理。5 项浏览器、12 帧、安装程序/九项资源/五项关联核对通过；软件图标与认可尺寸保持，实际视觉待用户。
- [`2026-08-29-pdf-outline-sidebar.md`](tasks/active/2026-08-29-pdf-outline-sidebar.md) — `waiting_user_acceptance`; PDF outline row layout and blank-page bookmark filtering are implemented and automatically verified.
- Latest completed task: [`2026-10-09-sidebar-release.md`](tasks/archive/2026-10-09-sidebar-release.md)；用户已验收的侧栏 b2c1553 完成正式构建及本机覆盖安装，20 条正式历史安装/启动前后完全保留；[侧栏实现任务](tasks/archive/2026-10-09-markdown-sidebar.md)已验收归档。

## Implemented at the application baseline

- PDF 阅读、搜索、按层级逐行显示并过滤空白页占位书签的目录、缩略图、打印、批注和页面增删。
- PDF 目录/缩略图与 Markdown 目录统一 168px 最小宽度，到最小后继续左拖其 70%（约 118px）才完全收起；顶部对应按钮恢复拖动前的宽度。
- PDF.js 构建资源按运行时请求路径平铺复制，未嵌入 Adobe CJK 字体的 PDF 可正常加载 CMap 并显示文字。
- PDF 文字可从行侧空白开始选择，拖到末行下方补全该行，拖回文字恢复精确终点；已有选区在缩放和连续 Ctrl＋滚轮重绘期间保留。
- 可填写 PDF 的表单内容只渲染一次，不再出现已复现的文字重影。
- Markdown 所见即所得/源码模式、显式保存、等宽代码字体和左侧目录；目录支持拖动调宽与完全收起，窄窗口限制宽度并保留本标签页布局；渲染区域采用 Crepe 官方完整 Frame 浅色主题。
- 新标签页提供本地磁盘/文件夹逐级浏览、固定及最近常用文件夹、路径/导航/当前列表筛选；保留原生文件选择、无需预选位置的未命名 Markdown 创建和跨启动不限条数最近文件列表。本地文件入口实际视觉与交互待验收。
- 标签切换、关闭、排序、拖出窗口和跨窗口停靠；标签拖动具有跨窗口跟随预览、释放点定位、标签页栏悬停抬升和可靠的原生 Z 序。
- 标签页显示 PDF、Markdown 或通用文件类型图标；同一标签栏中的标签页等宽，并在 `28px` 至 `220px` 范围内随可用标题栏空间自适应。空间收缩时先隐藏未选中标签的关闭按钮，文字自然被截断；极窄时选中标签保留关闭按钮，未选中标签保留类型图标。
- Windows 自定义标题栏、原生窗口按钮和 Snap Layout。
- 文件关联、拖放打开和单实例文件转发；会话元数据会保存，但普通启动不自动恢复上次文档。
- Windows 文件关联安装 PDF 与 Markdown 专用 ICO，并为 NSIS 和 MSI bundle 的两套关联类注册相应的 `DefaultIcon`。

## Recorded automated verification

2026-10-10 本地文件新标签页：左侧/主页固定与常用目录、此电脑本地磁盘与逐级目录浏览、历史导航/上一级/刷新/路径/当前筛选已实现，独立 `reader.folder-locations.v1` 存储保持原最近文件 v1。115 项前端、46 项 Rust 和最终 9 项 Edge 浏览器通过，TypeScript/Vite 1209 模块、fmt/clippy、文档/diff 检查通过；布尔表达式静态修订后 2 项真实目录测试再验通过。覆盖固定重载/幂等、取消打开、路径错误/旧响应抑制/刷新不计次、330/620/1100px 与 40 条最近文件。独立标识 `com.earendil.reader.localhome20261010` 检查窗口 PID 77336、句柄 2361652、响应正常，当前模块 HTTP 200；实际桌面与权限/可移动设备仍待用户。无新增依赖、正式打包/安装、历史迁移、截图或桌面自动化；Pi 未调用。正式 PID 68904 保持运行，检查版不会显示正式历史。

2026-10-09 已验收侧栏发布（b2c1553）：正式 Tauri 构建退出 0，通过 TypeScript/Vite 1207 模块、Rust release（4m32s）、MSI/NSIS 打包；MSI 覆盖安装退出 0，新产品 {6086E093-4DCB-43D5-B45C-B7145776D844} 状态 5、旧 {10802324-E9D6-443D-942B-117D518E76D0} 状态 -1。安装程序除 UNK→MSI 三字节标记外匹配，九项资源和五项 DefaultIcon 匹配；正式 PID 55468、可见句柄 1050600、响应正常。正式最近列表原有 20 条在安装前/后/启动后内容完全一致；独立侧栏检查版有 3 条，按标识及 origin 隔离，当前证据不支持覆盖升级清空正式历史。构建和安装证据另存本轮 releases；没有外部上传、缓存清理、截图或桌面自动化。Pi 未调用，Rust 测试及 NSIS 安装/卸载未重复，包未签名。

2026-10-09 最新反馈：70% 明确指到最小宽度后继续左拖其 70%，所以目标阈值为 50.4px，晚于原先 84px。8 项相关浏览器回归、111 项前端测试和 TypeScript/Vite（1207 模块）通过，文档/diff 检查通过；新增 ani1320588.pdf 的真实 PDF 目录测试，与 Markdown 和缩略图分别检查 84px/51px 仍展开、50px 收起及恢复。PID 58744 检查窗口已热更新（模块确认当前 70% 规则）、响应正常，并补开带真实书签的 `sidebar-outline-review.pdf` 副本。实际桌面体验待用户，Pi 未调用，Rust 测试和安装包未重跑。后续各段为早期步骤证据。

2026-10-09 侧栏续接反馈修订：PDF/Markdown 共用分隔条，168px 最小宽度、84px 拖动收起阈值。57 项真实 Edge 浏览器回归通过（新增 3 项阈值/恢复测试，PDF 选字缩放回归包含在内），验证 85px 不收起、84px 收起、释放清理、拖动前宽度/窄窗口偏好恢复、Markdown 内容与实例保留；111 项前端测试和 TypeScript/Vite（1207 模块）通过，既有大 chunk 提示。检查窗口沿用 PID 58744，Vite 热更新并补开临时 PDF；实际桌面验收仍待用户，Pi 未调用，Rust 源码未改，Rust 测试与安装包未重跑。下段为首轮交付记录。

2026-10-09 Markdown 侧栏：新增 4 项真实 Edge 浏览器回归，连同选字/编辑/工具共 24 项通过，覆盖拖动边界、键盘、捕获丢失、完全收起/恢复、模式切换、330px 窄窗口及未保存内容/编辑器实例保留。16 文件、111 项前端测试与 TypeScript/Vite 生产构建（1206 模块）通过，仅既有大 chunk 提示；文档检查与 diff 检查通过。独立标识 com.earendil.reader.sidebar20261009 开发编译成功（1m37s），窗口“Reader · Markdown 侧栏验收”PID 58744、句柄 2559122、响应正常，传入临时 Markdown 副本，Vite 侧栏模块包含当前实现。无截图或桌面自动化验收；Pi 未调用，Rust 源码未改，Rust 测试和安装包未重跑，实际 WebView2 交互待用户。

2026-10-07 最新选定图标 d7c2aab：PDF B / MD D 原路径保留，内部镂空不透明白色、同 HSL 饱和度 36.97% / 明度 53.33%，保留 24px 标签/32px 列表与 Windows 最长维度 228/256px。5 项浏览器及 12 ICO 帧通过，软件资产逐字节未改；TypeScript/Vite 1206 模块、Rust release 1m12s、MSI/NSIS 退出 0。本机 MSI 首次因旧版卸载需管理员权限失败（1603 / 1730），Windows UAC 授权后退出 0；安装程序、九项资源和五项关联匹配，正式 PID 29008、Reader 可见句柄 395576、响应正常。cargo clean 移除 4,240 文件（1.7 GiB），项目约 2.29→0.57 GiB。实际视觉待用户；无桌面截图/视觉自动化，Pi 未调用，Rust 测试与 NSIS 安装/卸载未重跑。详见最新发布记录。

此前 2026-10-07 选型阶段（尚未选定时的历史记录）：四套固定上游提交、八个 SVG 及原始许可已保存，全部清单哈希和 Tauri 原生渲染通过；对照图展示 96/32/24px、浅/深背景，无桌面截图或自动化视觉验收。仅准备候选，无应用改动或重复应用测试，Pi 未调用。84a5a26 的 TypeScript/Vite（1206 模块）、Rust release（4m48s）、MSI/NSIS 构建退出 0，包已另存 `releases/2026-10-07-0.1.0-84a5a26/` 并核对哈希/安装器关联；没有安装。其 MSI 20,922,368 字节、NSIS 16,028,591 字节，未签名；具体 SHA256 见该目录 packages.json。正式程序仍 cb72c45，PID 21688。为选定图标后增量构建暂留 release 编译缓存，最终验收后按既有授权清理。

2026-10-07 上一轮截图反馈修订（cb72c45，已安装，尺寸已认可、填充待改）：

- 最近图标 18px→32px，标签仍 24px，行高不增加；原轮廓/字母/颜色不变，文字下白底与纸面连通。生成器只对 Windows 文件 ICO 裁外围留边为 18×18，不改变 UI 22×22 母版或软件图标。5 项浏览器检查通过（含 330/620/1100px 布局、实际白底像素、列表/标签尺寸）；两个 ICO 全部 12 帧解码通过，256px 可见高度 228px、中心纯白不透明/外角透明。
- TypeScript/Vite（1206 模块）、Rust release（5m49s）、MSI/NSIS 构建均通过；MSI 覆盖安装退出 0、程序/图标/许可与源码资源匹配，五项关联正确，SHChangeNotify 已执行。正式版 PID 1692、Reader 可见句柄 263718、响应正常。Rust 测试与 NSIS 安装/卸载未重跑。
- cargo clean 移除 4,209 个文件（1.7 GiB），项目 2,388,078,454→542,309,810 字节，约 2.22→0.51 GiB；发布包/证据、源码、依赖和安装数据保留。用户认可尺寸，但否定填充；后续明确选择 Word 彩色底白字/窄白边，新实现的 12 帧/5 项浏览器已通过，正式包待生成。

此前 2026-10-07 图标修订（6417832，已由 cb72c45 替换）：

- 用户接受 Fluent 软件图标设计，要求所有位置同步；brandIcons 覆盖标题栏、首页、标签、最近文件、两类拖拽预览和未知文件，favicon 同步。最新文件反馈已实现：保留完整旧 Bootstrap 轮廓路径/字母/颜色，仅增加内部不透明白底，无格式色块。最终 5 项浏览器测试和两个 ICO 的全部 12 帧解码通过，中心为纯白且不透明、外角透明。
- 最终 MSI/NSIS 构建退出 0，TypeScript、1206 模块前端与 Rust release（1m17s）通过。MSI 安装退出 0，程序、ICO/PDFium/许可和五项 DefaultIcon 核对一致，Windows 正常刷新通知已发出；正式版 PID 25940 响应正常。cargo clean 清掉 3.7 GiB，项目约 4.16→0.47 GiB。详细交付证据见下文；未重复 Rust 测试或 NSIS 安装/卸载，不将自动化和设计认可扩大为实际视觉验收。

以下为同任务先前步骤的历史验证，旧进程与“未安装”描述不代表最终状态：

- 最新修订：弃用本地粗绘软件标记和三种提案，采用 Microsoft Fluent Emoji Open book / Color（固定提交 e8a613a0baedbca8f144fa70950714f2583318a8，MIT 许可），保留原路径/渐变/过滤器，扩展画布调整占比。应用 PNG/ICO/ICNS 已重生成，全部六个 ICO 帧解码和尺寸检查通过，所有中心完全不透明、外角透明、首帧 256px；文件 ICO 与工具实现未再改变。
- Tauri 开发自动重编译通过（10.66s），检查版 PID 7588 响应正常，实际标题 Reader · 图标调整验收 的可见窗口句柄 395220；绝对路径 PDF 参数已补发。这里只读取窗口元数据，不做截图或视觉验收。未重复无关应用测试或正式安装。
- 许可资源映射加入后再次原生编译通过（13.65s），当前检查进程 PID 24540 响应正常，PDF 绝对路径参数再次补发；debug/licenses/fluent-emoji.txt 已复制且哈希与许可源文件一致。固定提交的原始 SVG 哈希核对通过，软件 SVG 除画布与定位外完整保留上游内容。
- 软件图标被用户明确否定；新增本地矢量候选 A 展开书页（建议）、B 文档与折角、C 简洁书签。三者经 Tauri 转换成功，预览使用 ICO 原生 24/32/48px 帧及 128px PNG；候选未替换 shell-reader.svg 或已安装图标。本轮仅提案与文档，未重复应用测试、编译或重启检查程序。
- 两栏共用 18px SVG 遮罩及删除线；Markdown 16、PDF 10 个图形全部实际解码，删除线图形、尺寸和未激活颜色一致。
- 41 个相关浏览器用例有通过记录：首轮 38 通过，2 项页面加载超时、1 项 PDF 手势失败；仅重跑失败的 3 项后全部通过，未修改选择或编辑实现。Markdown 生命周期 8 项组件测试通过。
- 图标生成成功，三套 ICO 均含 16/24/32/48/64/256px，应用首帧 256px；256px 中心完全不透明，外角透明，主体未顶满画布。TypeScript 与生产构建通过（1204 模块、既有大 chunk 提示）。
- Tauri 调试重编译成功（3m49s），临时独立标识 `com.earendil.reader.icons20261007`、窗口 `Reader · 图标调整验收` 已启动，PID 17580、非零句柄、响应正常；Markdown 为临时副本，PDF 已以绝对路径补开。调试符号/增量缓存禁用仅作用于本轮启动终端，Rust 缓存约 1.97 GiB。
- 无截图或桌面自动化验收；未重跑 Rust 测试或重新打包安装。正式桌面文件关联仍显示既有安装图标，可能另有 Explorer 缓存。

2026-10-07 最新验收/发布基线 de45f91：

- 16 文件、111 项前端测试通过；最近文件与 Markdown 工具针对性浏览器测试 14 项通过，含 101 条存储/重载、40 条列表滚动/点击及全部 16 个 SVG 遮罩的 CSS/解码检查。此前 PDF/Markdown/Home 共 65 个不同浏览器用例已通过，未因纯打包重复运行。
- 正式 Tauri 构建退出码 0，重新通过 TypeScript、1196 模块前端构建、Rust release 编译及 MSI/NSIS 打包。Rust 源码未改，未重复 Rust 测试套件；仍有既有大 chunk 提示。
- 用户已验收界面、最近文件及 MD 图标修复；正式标识 com.earendil.reader 的 MSI 已覆盖安装并启动，安装文件与打包源码匹配。具体发布与清理证据见下文和归档任务。

2026-10-07 针对全面界面重做及八点验收反馈修订记录：

- 整体重做基线 `f470e84` 曾通过 108 前端/37 浏览器测试；用户随后提出图标、标签底线、工具位置、输出一致性、多余标签、选字浮层、首页文案及 Markdown 模式八点反馈，本轮已修订同一目标。
- `pnpm --dir reader test`：16 文件、108 项通过；`pnpm --dir reader test:browser`：48 项通过（PDF 30、Markdown 18）。新增回归覆盖外置格式/保存/快速撤销、公式/链接、打印快照与两模式隔离、状态/焦点、窄窗口和应用内删页确认，原选择与缩放回归仍通过。
- `pnpm --dir reader build`：TypeScript 和生产构建通过，仅既有大 chunk 警告。
- 首页 330/620/1100px 无横向溢出，长文件/路径、空状态、减少动画与运行错误检查通过。软件/文件 ICO 结构有效，包含 16/24/32/48/64/256px 帧；SVG 采用 Bootstrap Icons 1.13.1 并保留许可。无截图或桌面视觉验收。
- 启动日志发现原删页系统确认的 `dialog.confirm` 权限错误；改为应用内模态，取消不调用删除，确认保留页码和原命令，不增加权限。
- 图标变更后 Tauri 开发重编译成功，检查窗口 `Reader · 界面美化验收`（独立标识 `com.earendil.reader.polish20261007`，PID 10044）运行并打开临时 PDF/MD 样本，前端已热更新。Rust 源码未改，Rust 测试和安装包未重跑；安装版与 Explorer 图标仍为此前产物。
- 文档和完整 diff 检查通过。Markdown 原生打印对话框/纸张、WebView2 交互与视觉仍由用户确认。
- 用户此前要求停止 Pi 并删除自动调用/免费时段/固定 GLM 规则，已停止会话 `reader-interface-polish-20261007-1100`，当时无代码 diff。全部实现由 Codex 完成，本轮未调用 Pi。

2026-10-05 针对 PDF 空白起点选字记录：

- 修复前真实 Edge 测试复现左侧空白起点产生空选区，而文字内部拖动正常；仅启用文字层选择仍漏首字，因此加入局部起点校正。
- `pnpm --dir reader test`：16 个文件、108 项测试通过。
- `pnpm --dir reader test:browser`：17 项真实 Edge 功能测试通过，含新增 8 项 PDF 回归，覆盖左右空白起点、文字内部、反向、重选、空白单击取消、跨行、缩放/滚动及高亮 quads；PDF.js/React/CSS 真实运行，文件协议与批注写入模拟，无截图、视频或 trace。
- `pnpm --dir reader build`：TypeScript 与生产构建通过，1171 个模块；仅既有大 chunk 警告。
- 文档和 diff 检查通过；Tauri 开发编译完成，通过临时独立应用标识启动验收窗口并打开文字 PDF 样本副本。纠正 pnpm 启动示例的分隔符，直接 Tauri CLI 启动已验证文件参数正确。
- 首轮交付时原问题 PDF 的真实 WebView2 交互待用户验收，后续反馈及最终验收见下文；本次未改 Rust，Rust 测试和安装包未重跑。

同日用户反馈“已有选区在缩放后失效”后的修订记录：

- 修复前按钮、快捷键、Ctrl＋滚轮和适合模式四项真实浏览器回归均复现选区变空；PDF.js 缩放会主动清选，搜索高亮还会替换文字子节点。
- `pnpm --dir reader test`：108 项通过；`pnpm --dir reader test:browser`：26 项通过，其中 PDF 17 项、Markdown 9 项。新增 9 项验证已有选区缩放后的文本、方向、比例几何、搜索高亮重绘、重绘期间取消及普通页面跳转清选。
- `pnpm --dir reader build`：TypeScript 与生产构建通过，1172 个模块，仅既有大 chunk 警告。文档与 diff 检查通过。
- 开发窗口继续运行；Vite 已热更新 `PdfViewer.tsx`，新适配模块和引用模块均返回 200 并含当前修订，没有新增前端初始化错误。该轮交付时真实 WebView2 复验待用户完成，后续反馈及最终验收见下文；Rust 与安装包本轮未重跑。

同日用户再次反馈 Ctrl＋滚轮仍失效后的第二次修订记录：

- 新回归复现滚轮后立即读选中文字为空；旧测试等待重绘完成，漏查 `drawingDelay: 180` 隐藏文字层的阶段。缩放和延迟 refresh 后立即更新所有选中页面的缓存文字层，保持文字及复制可用；引擎照常重绘画布，用户取消仍取消恢复。
- `pnpm --dir reader test`：108 项通过；`pnpm --dir reader test:browser`：31 项通过（PDF 22、Markdown 9）。新增 5 项覆盖连续滚轮、选区绘制范围、延迟重绘期间文本和复制处理器、搜索及跨页；复制测试使用事件剪贴板，不读写 Windows 剪贴板。
- `pnpm --dir reader build`：TypeScript 与生产构建通过，1172 个模块，仅既有大 chunk 警告。
- 已新开检查 PDF，并在确认无未保存 Markdown 后完整重载当前窗口。临时运行诊断确认重载后的所有 PDF 实例包含即时文字更新；诊断与重载代码已移除，不进入提交。该轮交付时用户验收待完成，最终验收见下文；未截图，Rust 与安装包未重跑。

同日用户确认缩放和选择起点正常，继续反馈末行空白终点漏字后的修订记录：

- 真实三行鼠标手势先复现从文字或空白起点向下拖动后，第三行只选到 `Page one`；现仅在 PDF 文字层空白处补正拖动终点，越过行底/行顶分别补到行尾/行首，回到文字后保持原生字符终点。
- `pnpm --dir reader test`：108 项通过；`pnpm --dir reader test:browser`：37 项通过（PDF 28、Markdown 9），新增 6 项覆盖末行补全、返回文字和释放稳定、反向、右侧空白及完整末行高亮几何；已验收的缩放回归仍通过。
- `pnpm --dir reader build`：TypeScript 与生产构建通过，1172 个模块，仅既有大 chunk 警告。当前窗口在无未保存 Markdown 的情况下完整重载，临时运行诊断确认终点适配器已加载；诊断代码已移除。
- 用户于 2026-10-05 回复“验收”，确认本任务整体通过，最终源码基线 `c267f35`，任务已归档。用户未提供独立剪贴板内容记录；未截图，Rust 与安装包未重跑。

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

2026-10-09 从用户已验收侧栏源码 `b2c1553` 生成正式 MSI/NSIS，版本 `0.1.0`、标识 `com.earendil.reader`；本机 MSI 已覆盖安装并启动。包与证据保存 `releases/2026-10-09-0.1.0-b2c1553/`，不纳入 Git，未上传外部平台。

| Format | Repository-relative output | Size (bytes) | SHA-256 | Signature |
| --- | --- | ---: | --- | --- |
| MSI | `releases/2026-10-09-0.1.0-b2c1553/Reader_0.1.0_x64_en-US.msi` | 20,930,560 | `F2816B7826322C8FBB4B9CCA5A86A55809FA67BC27621073DCA34FF71695244D` | `NotSigned` |
| NSIS | `releases/2026-10-09-0.1.0-b2c1553/Reader_0.1.0_x64-setup.exe` | 16,040,985 | `9A6EA5B12BA4325AA86DBFCA9D35683D6D61451E98FDAAD764A6B7F8FE55EB5D` | `NotSigned` |

- MSI ProductCode={6086E093-4DCB-43D5-B45C-B7145776D844}，UpgradeCode 不变、同版本升级属性 257；安装退出 0。新登记状态 5，旧 d7c2aab 登记状态 -1。
- 安装 exe 17,497,600 字节，SHA256 `E9394AA6C26A25FF51560C219E459358ACE35EEB385D0F851814BFEF532B30BB`；仅包类型 UNK→MSI 标记不同，归一完全一致。两 ICO、PDFium、六份许可/notice 共九项资源和五项文件关联匹配。
- 正式 PID 55468、Reader 可见句柄 1050600、响应正常；未重跑 Rust 测试/NSIS 安装或卸载，未做桌面视觉自动化；侧栏此前已由用户验收。开发版正常关闭，服务停止；本轮未清理构建缓存。
- 正式 `reader.recent-files.v1` 安装前/后/启动后均 20 条，内容完全一致；检查标识 `com.earendil.reader.sidebar20261009` / `http://localhost:1420` 另有 3 条。诊断与正式 localStorage 备份在发布目录，本次不把样本历史合并到正式列表。
- 证据：build.log、install.log、packages.json、msi-audit.json、upgrade-registration.json、installed-files.json、installed-associations.json、startup.json、history-before/after-install/after-startup.json 与 history-comparison.json。

### Previous release d7c2aab

以下本地文件不纳入 Git。2026-10-07 从选定图标源码 `d7c2aab` 生成 MSI/NSIS，版本仍 `0.1.0`、正式标识 `com.earendil.reader`；本机 MSI 已覆盖安装，PDF B / MD D 同饱和度配色与不透明白色内部填充已交付，实际视觉待用户。包与证据独立于已清理的 target，未上传外部平台；前版目录保留，84a5a26 Word 稿未安装。

| Format | Build scope | Repository-relative output | Size (bytes) | SHA-256 | Signature |
| --- | --- | --- | ---: | --- | --- |
| NSIS | 2026-10-07 / `d7c2aab` | `releases/2026-10-07-0.1.0-d7c2aab/Reader_0.1.0_x64-setup.exe` | 16,039,891 | `CF3125F2290D5A7FE712BEE5F7E1B84B95F8DE656D180DD0F4CDF9314759933F` | `NotSigned` |
| MSI | 2026-10-07 / `d7c2aab` | `releases/2026-10-07-0.1.0-d7c2aab/Reader_0.1.0_x64_en-US.msi` | 20,926,464 | `9846E2100E29A070CABAA11E107E64F9CD88DFA31262F7487B3A1551F0E59E95` | `NotSigned` |

本次 MSI 构建与启动证据：

- 构建退出 0；首次安装 1603 / 1730（旧版卸载需管理员权限），UAC 授权后退出 0。ProductCode={10802324-E9D6-443D-942B-117D518E76D0} 已登记，旧 cb72c45 {79DDEC28-0B6B-424F-97A8-1F7CC587E8AC} 登记移除，升级属性 257。
- 安装 exe SHA256 `9A76AE5BCC6848A824D431DBC0E48A200EB74E9F8AC35EF69DEAFBC5E3314F0F`，仅 UNK→MSI 三字节标记差异；两 ICO、PDFium、六份许可/notice 共九项资源匹配，五项关联正确并刷新。正式 PID 29008、Reader 句柄 395576、响应正常。
- 发布目录保留 packages.json、build.log、两次安装日志、msi-audit.json、installed-verification.json、upgrade-registration.json、startup.json、file-icon-frames.json、generated-main.wxs、generated-installer.nsi、cleanup.log 与清理前后统计；清理 4,240 文件 / 1.7 GiB，项目 2,464,145,478→617,218,785 字节，约 2.29→0.57 GiB。
- Windows 默认应用选择未改；不强删系统缓存或重启 Explorer。Rust 测试、NSIS 安装/卸载未重复；包未签名，实际视觉仍待用户。

### Previous release cb72c45

原列表/系统尺寸版已由 d7c2aab 替换；该版尺寸获用户认可、填充被否定。包与安装/清理证据保存在 `releases/2026-10-07-0.1.0-cb72c45/`，旧产品登记已经移除。

### Previous release 6417832

以下为前一版原轮廓白底安装/清理的历史证据：

- 最终构建与 MSI 安装退出码均为 0。ProductCode={33FE60A1-7D97-4E5A-8E39-7DD3A2F6D166}、UpgradeCode={8C88C1AD-4BA2-5A3C-9E5F-45B76A862470}，同版本升级属性 257；新登记存在，3ae410e/de45f91 两个前版登记已移除。MSI/NSIS 包内均含 PDFium、两个 ICO 和两份许可；MSI 许可使用源文件名 LICENSE/ LICENSE-fluent-emoji，NSIS 使用映射 .txt 名称。NSIS 本轮未单独安装。
- 安装目录 C:\Users\fanq1\AppData\Local\Reader。reader.exe 为 17,496,576 字节，SHA256 C72719786D266A887C3C7AC4EBBD8088F5F03772E62535151C664BC27E53F86B；除 UNK→MSI 三个标记字节外与 release 完全相同。两个 ICO、PDFium 与许可哈希相同，五项 DefaultIcon 正确；桌面快捷方式使用该正式 exe。已执行 SHChangeNotify 关联及资源/快捷方式更新通知，不改变默认应用选择或强删系统缓存。
- 安装后启动记录 PID 25940、标题 Reader、非零句柄 1050566、响应正常；交付末次窗口元数据为正式版 PID 25096、Reader 可见句柄 1902778、响应正常。开发进程/服务已退出，cargo clean 移除 7,500 文件（3.7 GiB）；项目同口径 4,463,309,902→504,928,728 字节，约 4.16→0.47 GiB。源码、Git、依赖、PDFium、发布包和安装数据保留。
- 证据保存为 build.log、install.log、packages.json、msi-audit.json、generated-main.wxs、generated-installer.nsi、installed-verification.json、startup.json、current-windows.json 和 cleanup.json；实际视觉仍由用户验收。

### Previous release de45f91

以下为此前已验收界面版本的历史安装/清理记录，程序已被上述图标修订包替换：

- `pnpm --dir reader tauri build`：退出码 `0`；前端、Rust release、WiX candle/light 和 makensis 完成。发布目录中 `build.log` 保存完整日志。
- MSI 数据库：`ProductVersion=0.1.0`、`ALLUSERS=1`、`ProductCode={01DCC369-8B30-46C6-8424-46E9E72B6279}`；UpgradeCode 保持 `{8C88C1AD-4BA2-5A3C-9E5F-45B76A862470}`，升级表最小版本 `0`、无最大版本、属性 `257`，覆盖同版本 MSI。包内含 reader.exe、PDFium 和两种 ICO，五项 DefaultIcon 正确；NSIS 脚本含资源及图标 hook，NSIS 未单独安装。
- MSI 安装退出码 `0`，日志确认成功，新产品已注册，旧 `{0BCEC9F0-9CE3-4EF1-8CE3-CBA1F61806AD}` 登记已移除。历史 NSIS 登记保留；本轮未测试卸载。
- 安装目录 `C:\Users\fanq1\AppData\Local\Reader`。reader.exe 为 17,491,456 字节，SHA-256 `BBF7D34AA3821A427CBB47DA83B4DDE1DE6AD25C2965D74F95572F6A5E0B5BF6`；与 release 仅 UNK → MSI 的三个标记字节不同，归一后完全一致。PDFium/ICO 哈希匹配，五项实际 DefaultIcon 正确。安装版 PID `17188`、非零窗口句柄并响应正常；这些是启动证据，不替代新的交互结论或纸张打印。
- 正常关闭开发检查窗口，开发服务已退出；`cargo clean` 成功移除 23,618 个文件（构建工具报告 20.7 GiB）。清理前后同口径统计为 22,570,065,503 → 429,813,631 字节，约 21.02 → 0.40 GiB，减少 98.1%；发布记录和最终 Git 提交会增加少量字节。
- 源码、Git 历史、开发依赖、PDFium、发布包及用户安装数据保留。自动审批阻止直接递归删除，因此使用 Cargo 自带清理；较小的 dist/测试/Vite 缓存保留。下次原生构建需要重新编译。

## Latest user acceptance

- 2026-10-09：用户验收 Markdown 侧栏调宽、168px 统一最小宽度及 PDF/Markdown 继续左拖 70% 才收起的实现（b2c1553），授权正式发布与覆盖安装。

- 2026-10-07：用户确认全面界面重做、最近文件不限条数及 MD 图标修复验收通过（de45f91），并授权发布、安装与清理。界面任务已归档。

- 2026-10-05：用户确认 PDF 文字选择起点、缩放选区保留及末行空白终点修复验收通过，源码基线为 `c267f35`；任务已归档，未生成新安装包。PDF 目录任务仍独立等待验收。
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
