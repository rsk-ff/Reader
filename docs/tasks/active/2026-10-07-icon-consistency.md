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

统一软件内与 Windows 文件图标。用户已选 PDF B（Material Icon Theme）、MD D（Material Design Icons），要求饱和度统一。保留已认可的 Fluent 软件图标、标签/列表/系统显示尺寸；只替换两类文件资产、处理白色不透明填充并统一配色。完成针对性验证、正式构建、本机覆盖安装与缓存清理。

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

PDF 使用 B 原图，MD 使用 D 原图，不重绘原路径；同饱和度/明度红蓝配色，原镂空区域填不透明白色、外围透明。应用和 Windows 共用同一母版；原宽高比保留，最长可见维度与认可版本一致。所有入口同步，软件图标和右侧工具不再改。

## Scope

图标资产/生成资源、所有应用内引用、针对性验证和文档；本机 MSI 覆盖安装、Windows 正常刷新通知与已授权的编译缓存清理。

## Out of scope

编辑、文档写入、目录任务和工具功能；不上传外部平台，不改变默认应用选择，不删除用户数据或全局缓存。

## Constraints and decisions

无新增依赖；保留上游固定提交和许可，加入 Apache 2.0 全文与修改 notice 随包携带。Codex 直接实现，不调用 Pi、不截图或桌面自动化视觉验收。文件采用 PDF B / MD D；原坐标路径不变，以 .8 比例放入 22×22 UI 画布，原生裁外围为居中 18×18，最长可见维度保持 16/18。PDF #b45c5c / MD #5c83b4 的 HSL 饱和度 36.97%、明度 53.33% 相同。仅内部白色背衬新增，不增加装饰外框或拉伸 MD。

## Acceptance criteria

- [x] PDF B / MD D 的原路径保留，源哈希可追溯；内部白色不透明，配色同饱和度与明度。
- [x] 全部软件图标生成资产与修改前逐字节相同。
- [x] 列表 32px、标签 24px、行高≤49px，330/620/1100px 无溢出、40 条记录可滚动点击；5 项浏览器通过。
- [x] 两文件 ICO 全部 12 帧解码，外角透明、白色像素不透明、图形不触边；256px 最长可见维度均 228px。
- [x] 正式 MSI/NSIS 构建与全部许可/资源/关联检查。
- [x] MSI 覆盖安装、程序与资源核对、正常 Windows 通知和启动。
- [x] 构建缓存清理并保留包和证据。
- [ ] 用户确认首页/标签/桌面/文件夹实际显示效果。

## Progress

- [x] 用户选定“PDF B, MD D”，随后要求“饱和度调统一”；应用母版与两文件 ICO 已更新，原 SVG 路径逐项与固定上游资产匹配。5 项浏览器和 12 帧解码通过；新增许可/notice 资源映射，软件资产逐字节无变化。
- [x] 最新选定版本 d7c2aab 正式构建/安装/清理完成。构建/资源/安装/升级/启动/清理证据保存在 releases/2026-10-07-0.1.0-d7c2aab；实际视觉待用户。

以下是此前迭代记录；此前 Word 稿未安装、选型等待状态已被本轮选择替代。

- [x] 最新用户要求“再找找现成的图标让我挑”：暂停安装本地 Word 风格稿。四套现成候选为 VSCode Icons、Material Icon Theme、Font Awesome Free 6.7.2、Material Design Icons；八个 SVG/原始许可/固定提交和 SHA256 已保存，全部哈希、解析与 Tauri 原生渲染通过，浅/深背景及 96/32/24px 对照图已生成。原图未改；C/D 仅外层预览设红/蓝色，镂空透明如实显示。
- [x] 84a5a26 正式构建完成，TypeScript/Vite 1206 模块、Rust release 4m48s、MSI/NSIS 退出 0。两个包另存 releases/2026-10-07-0.1.0-84a5a26，复制哈希与 MSI 文件/五项关联审计通过，未安装。当前正式安装仍 cb72c45，PID 21688。暂留 release 编译缓存供选定后增量构建；此阶段不重复清理或构建。
- [x] 用户选择现成候选 PDF B / MD D；最新安装与验收仍待完成。

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

用户随后要求“验收”：本轮重新核对已安装 exe 和九项资源共 10 个哈希、两份发布包大小/哈希、五项实时 DefaultIcon、新 MSI 登记 State=5，全部一致；当前正式 PID 29008 响应正常，工作树干净且 target 已不存在。证据补充至发布目录 acceptance-audit.json。文档检查（30 文件/2 活动任务）与 diff 检查通过；无新代码改动，不重复已通过的浏览器/构建或恢复编译缓存。未把“验收”单独视为视觉已通过，已按 AGENTS.md 第 76–79 行向用户请求实际视觉反馈；当前等待其确认，未归档。

最新 d7c2aab 交付：5/5 浏览器、12 ICO 帧解码通过；两上游原路径未改、所有软件图标资产逐字节未改。TypeScript/Vite 1206 模块与 Rust release 1m12s、MSI/NSIS 构建退出 0，两包新许可/notice 与五项关联核对通过。普通静默升级首次退出 1603，具体错误 1730 为卸载旧版需要管理员权限；失败日志保留，Windows UAC 授权后升级退出 0。新 ProductCode={10802324-E9D6-443D-942B-117D518E76D0} State=5，旧 cb72c45 登记 State=-1。安装 exe 17,496,576 字节、SHA256 9A76AE5BCC6848A824D431DBC0E48A200EB74E9F8AC35EF69DEAFBC5E3314F0F，仅 UNK→MSI 三个标记字节不同，归一一致；两 ICO/PDFium/六份许可或 notice 共九项资源哈希匹配，五项 DefaultIcon 正确并正常通知刷新。正式 PID 29008、Reader 可见句柄 395576、响应正常。cargo clean 清掉 4,240 文件（1.7 GiB）；项目 2,464,145,478→617,218,785 字节，约 2.29→0.57 GiB，发布包/证据、源码、Git、依赖与安装数据保留。没有桌面截图或视觉自动化；Rust 测试和 NSIS 安装/卸载未重跑。当前 source/build 状态已交付，实际显示由用户验收。

以下为先前迭代的历史证据，不代表当前安装状态。

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

软件 Fluent 图标及 cb72c45 尺寸已被认可；用户现选定 PDF B / MD D，要求饱和度统一。选择不等于最新安装版视觉通过，实际首页/标签/桌面/文件夹仍由用户检查。

## Risks and remaining work

实际视觉待用户；Windows 可能延迟刷新缓存，正常通知已发出，无全局缓存删除或 Explorer 重启。包未签名；NSIS 安装/卸载与 Rust 测试本轮未重复。编译缓存已清理，下一次原生开发需重新编译。

## Next action

用户检查正式安装版的新标签页最近文件、PDF/MD 标签，以及桌面/文件夹里的两类图标：尺寸、同饱和度红蓝、白色内部不透明。反馈继续本会话。

## Outcome

PDF B / MD D 与同饱和度/明度配色已统一软件内和 Windows，正式安装/验证/刷新/清理完成；实际视觉待用户。无 Pi 调用、会话 ID 无。继续本会话做视觉反馈，认可后归档；下一独立需求应新建会话。
