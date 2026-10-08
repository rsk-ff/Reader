# Windows and document rail icon refinement

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-07`
- Last updated: `2026-10-07`
- Base branch: `master`
- Base commit: `d2aede2`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

统一 Reader 在软件内部与 Windows 的软件/文件图标，并统一 PDF/Markdown 右侧工具图形和删除线。用户已接受 Fluent 软件图标与最新列表/系统/标签尺寸；曾选择 Word 彩色底白字/窄白边，最新要求先找现成图标挑选。当前交付四套现成 PDF/MD 对照图，等待选择后再替换，保持认可尺寸。

## Related context

- [Product](../../PRODUCT.md)
- [Existing icon candidates](../../../design/icon-options/2026-10-07/README.md)
- [Development](../../DEVELOPMENT.md)
- [Icon sources](../../../reader/src/assets/icons/README.md)
- [Generator](../../../scripts/generate-file-association-icons.mjs)
- [Brand catalogue](../../../reader/src/components/brandIcons.ts)
- [Shared rail](../../../reader/src/components/DocumentToolRail.tsx)
- [PDF tools](../../../reader/src/documents/pdf/PdfToolbar.tsx)
- [Markdown tools](../../../reader/src/documents/markdown/MarkdownTools.tsx)

## Current behavior

修订前系统轮廓图标透出桌面且占比过大；PDF/Markdown 工具来源与删除线不同。原生图标更新后，标题栏/首页和文件组件仍引用旧 SVG，已安装 Windows 资源也未同步。

## Expected behavior

软件采用已被用户接受的 Microsoft Fluent 书本；文件图形来源待用户从现成候选选定，之后保留认可尺寸并按反馈处理填充。软件内部与 Windows 共用母版并同步更新。两栏图标采用相同来源、尺寸和按钮样式，删除线相同。

## Scope

图标资产/生成资源、所有应用内引用、针对性验证和文档；本机 MSI 覆盖安装、Windows 正常刷新通知与已授权的编译缓存清理。

## Out of scope

编辑、文档写入、目录任务和工具功能；不上传外部平台，不改变默认应用选择，不删除用户数据或全局缓存。

## Constraints and decisions

无新增依赖；版权/许可随包携带，多尺寸 ICO 与应用 256px 首帧保留。Codex 直接实现，不调用 Pi、不截图或桌面自动化视觉验收。软件图标不再改；文件最新处于现成图标选型阶段，认可尺寸不变，不安装此前 Word 稿。应用内和原生生成器共用 brandIcons 对应母版，避免后续遗漏。

## Acceptance criteria

本轮选型标准：四套真实上游 PDF/MD 原图、来源/固定提交/许可可追溯；相同画布、浅/深背景及小尺寸对照。未经选择不覆盖正式安装。后续替换保留已认可的列表/标签/Windows 尺寸，全部入口同步、ICO 全尺寸解码，仍由用户确认实际视觉。

- [x] 用户接受 Fluent 软件设计；未将该认可扩大为整个交互验收。
- [x] 标题栏、首页、favicon、标签、最近文件、前端拖拽和原生拖拽预览同步新版母版。
- [x] PDF/MD 原纸张轮廓、字形与认可尺寸保持；最新 Word 风格实色底/白字/窄白边全部尺寸解码通过。
- [x] 两栏共用图形/尺寸/删除线，原操作自动化有通过记录。
- [x] 正式 MSI/NSIS 构建、MSI 覆盖安装、资源/关联核对、启动及缓存清理完成。
- [ ] 用户确认正式版所有位置实际显示效果。

## Progress

- [x] 最新用户要求“再找找现成的图标让我挑”：暂停安装本地 Word 风格稿。四套现成候选为 VSCode Icons、Material Icon Theme、Font Awesome Free 6.7.2、Material Design Icons；八个 SVG/原始许可/固定提交和 SHA256 已保存，全部哈希、解析与 Tauri 原生渲染通过，浅/深背景及 96/32/24px 对照图已生成。原图未改；C/D 仅外层预览设红/蓝色，镂空透明如实显示。
- [x] 84a5a26 正式构建完成，TypeScript/Vite 1206 模块、Rust release 4m48s、MSI/NSIS 退出 0。两个包另存 releases/2026-10-07-0.1.0-84a5a26，复制哈希与 MSI 文件/五项关联审计通过，未安装。当前正式安装仍 cb72c45，PID 21688。暂留 release 编译缓存供选定后增量构建；此阶段不重复清理或构建。
- [ ] 用户选择现成候选；之后统一替换并验收。

- [x] 本轮截图反馈：最近列表 18px→32px，标签图片仍 24px；Windows 生成器仅裁外围留白，22×22→18×18 可视画布，纸面高度占比 72.7%→88.9%。完整原字母和轮廓路径保留；补上字母伸出纸面的白底并连通纸面。5 项浏览器检查通过，含标签尺寸、列表尺寸/行高/窄布局，以及实际左侧白底像素；PDF/MD 全部 12 帧解码通过，256px 可见高度 228px、中心纯白/外角透明。源码 cb72c45，正式打包/安装与清理完成，不改软件图标及编辑功能。
- [x] 用户进一步回复“大小没问题了”，否定填充，提供 Word 与两个 PDF 图标参考；确认采用“像 Word：PDF／MD 用彩色底块、白字，外面留窄白边与纸面分开”。左下角红/蓝底白字已接入，标识外围仍在原白底范围内，画布/显示尺寸/纸面轮廓不变；原字形路径保留，以 .85 比例居中在标识内。12 帧解码与 5 项浏览器通过，实际实色/白边像素核对，整体 ICO 高度仍为 228/256px。首轮仅白边采样落在抗锯齿边缘，采样移至边中后 5/5；无图形或几何修改。正式包待构建。

- [x] 核对 Git、代码、用户截图和所有图标入口。
- [x] 两栏统一；软件粗绘和三种提案被用户否定，直接替换为成熟 Fluent 书本并移除失败提案。
- [x] 用户回复“就这吧”后补齐共享入口，源码提交 3ae410e。
- [x] 在中间包安装期间，用户要求文件恢复旧形状加白底；已按反馈重做，源码提交 6417832。
- [x] 最终正式包覆盖中间包、刷新关联、启动并保留发布证据，清掉 Rust 编译缓存。
- [ ] 用户验收。

## Discoveries

旧引用在 WindowTitleBar、NewTabPage 和 DocumentTypeIcon；共享 brandIcons 现覆盖所有文件组件使用位置。Windows 已安装文件不随源码自动变更，必须重建覆盖。生成 MSI 将许可保留为 licenses/LICENSE 和 licenses/LICENSE-fluent-emoji；NSIS 使用配置映射的 .txt 名称，两者都包含完整 notice。用户 .pdf/.md 默认类分别为 PDF Document、Markdown Document，五项 DefaultIcon 均核对正确。

## Verification

最新 cb72c45 安装证据：releases/2026-10-07-0.1.0-cb72c45。5 项浏览器、12 帧解码、TypeScript/Vite 1206 模块、Rust release 5m49s 和两个 bundle 通过；MSI 安装退出 0，ProductCode={79DDEC28-0B6B-424F-97A8-1F7CC587E8AC}，前版 {33FE60A1-7D97-4E5A-8E39-7DD3A2F6D166} 登记已移除。exe SHA256 E18249214C287B7598481D15236321C526590BFA5131FCAB2C63F97FD1139709，仅 UNK→MSI 标记三字节不同，归一一致；两个 ICO/PDFium/许可一致，五项 DefaultIcon 正确并通知刷新。PID 1692、Reader 可见句柄 263718、响应正常。清理 4,209 文件/1.7 GiB，项目 2,388,078,454→542,309,810 字节。Rust/NSIS 安装/卸载未重跑，无桌面截图或视觉自动化。下列为先前迭代历史记录：

- `pnpm --dir reader generate:file-icons` 通过；软件资产未改变，两个文件 ICO 已更新。文件原轮廓路径与 736aff1 中的 filetype-pdf/md 完全一致，颜色 #ba4f4f / #536b89 保留。
- .NET 解码 PDF/MD 各 6 帧（16/24/32/48/64/256px），所有中心 RGBA 为 255/255/255/255、外角 alpha=0，尺寸和数据边界通过。应用 ICO 保留 256px 首帧；此前 Fluent 六帧已检查。
- `pnpm --dir reader test:browser -- new-tab.spec.ts` 最终 5/5：6 个图像实际解码、同源和颜色/白底、无色块、330/620/1100px 无溢出及 40 条最近文件滚动；固定标题栏 36px、控制按钮 46px 保留。
- 两栏此前 41 个不同浏览器用例有通过记录：首轮 38/41、只重跑失败 3 项后全部通过；8 项 Milkdown 组件测试通过。最初两项加载超时、一项手势失败，未改选择逻辑；本次文件母版修订没有工具逻辑改动。
- `pnpm --dir reader tauri build` 最终退出 0：TypeScript、1206 模块 Vite、Rust release（1m17s）、WiX/NSIS 全部成功；仅既有大 chunk 提示。
- 最终发布目录 releases/2026-10-07-0.1.0-6417832 保存两个安装包、构建/安装日志、packages.json、msi-audit.json、generated-main.wxs、generated-installer.nsi、installed-verification.json、startup.json 与清理记录。包大小/哈希见 STATUS。
- MSI ProductCode={33FE60A1-7D97-4E5A-8E39-7DD3A2F6D166}，UpgradeCode 不变，升级属性 257；安装退出 0，新登记存在，中间 3ae410e 与旧 de45f91 产品登记已移除。历史 NSIS 登记保留，NSIS 和卸载未单独测试。
- 安装 exe 17,496,576 字节，SHA256 C72719786D266A887C3C7AC4EBBD8088F5F03772E62535151C664BC27E53F86B；与 release 只差 UNK→MSI 三个标记字节，归一后一致。两个 ICO、PDFium 和两份许可哈希匹配；五项关联正确，桌面快捷方式指向正式 exe。SHChangeNotify 关联及相关资源/快捷方式更新通知已执行，无缓存强删或 Explorer 重启。
- 安装后启动记录 PID 25940、Reader 句柄 1050566、响应正常；交付末次元数据 PID 25096、Reader 可见句柄 1902778、响应正常，另存 current-windows.json。开发进程/服务已退出；本轮没有截图或桌面视觉验收，不声称实际效果已通过。
- `cargo clean` 移除 7,500 文件（工具报告 3.7 GiB）；同口径项目统计 4,463,309,902→504,928,728 字节，约 4.16→0.47 GiB。保留源码、Git、依赖、PDFium、所有发布目录和安装数据。
- 文档和 diff 检查通过；最终证据提交以 Git 历史为准。未改 Rust 代码或重跑 Rust 测试。

## User acceptance

软件 Fluent 设计与 cb72c45 的尺寸已被用户接受；该版填充明确不满意。用户曾选 Word 彩色底白字/窄白边，本地实现 84a5a26 未安装；最新改为先挑现成图标，四套对照图已准备，未收到选择，不声称候选视觉通过。

## Risks and remaining work

实际视觉/候选选择待用户；多数原图含透明镂空，最终填充方案与来源应在选择后落实。Windows 可能延迟刷新缓存。安装包未签名；NSIS 安装/卸载和 Rust 测试未重跑。当前为选定后的增量构建暂留 release 缓存，最终验收后清理。

## Next action

等待用户从对照图选择 A/B/C/D；允许 PDF 与 MD 分别选择。之后按选择统一应用与 Windows 文件图标，保留软件图标和认可尺寸。

## Outcome

cb72c45 正式版安装/验证/清理完成，尺寸获得认可；84a5a26 Word 稿已构建但未安装。最新现成图标四套选型资料交付，等待选择。无 Pi 调用、会话 ID 无。反馈继续本会话，整体实际验收后归档任务；下一独立需求应新建会话。
