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

统一 Reader 在软件内部与 Windows 的软件/文件图标，并统一 PDF/Markdown 右侧工具图形和删除线。用户已接受 Fluent 软件图标；最新明确要求 PDF/MD 恢复之前的轮廓与字母，只把纸张内部填为不透明白色。

## Related context

- [Product](../../PRODUCT.md)
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

软件采用已被用户接受的 Microsoft Fluent 书本。文件完整保留原 Bootstrap filetype-pdf/md 路径、字母与配色，在纸张轮廓后增加纯白、不透明底层，外围仍透明，无格式色块。软件内部与 Windows 共用母版并同步更新。两栏图标采用相同来源、尺寸和按钮样式，删除线相同。

## Scope

图标资产/生成资源、所有应用内引用、针对性验证和文档；本机 MSI 覆盖安装、Windows 正常刷新通知与已授权的编译缓存清理。

## Out of scope

编辑、文档写入、目录任务和工具功能；不上传外部平台，不改变默认应用选择，不删除用户数据或全局缓存。

## Constraints and decisions

无新增依赖；版权/许可随包携带，多尺寸 ICO 与应用 256px 首帧保留。Codex 直接实现，不调用 Pi、不截图或桌面自动化视觉验收。软件采用 Fluent 上游完整图形，只扩画布调整占比；文件恢复原轮廓，仅加白底。应用内和原生生成器共用 brandIcons 对应母版，避免后续遗漏。

## Acceptance criteria

- [x] 用户接受 Fluent 软件设计；未将该认可扩大为整个交互验收。
- [x] 标题栏、首页、favicon、标签、最近文件、前端拖拽和原生拖拽预览同步新版母版。
- [x] PDF/MD 原轮廓及颜色保持，内部白底和全部尺寸解码通过。
- [x] 两栏共用图形/尺寸/删除线，原操作自动化有通过记录。
- [x] 正式 MSI/NSIS 构建、MSI 覆盖安装、资源/关联核对、启动及缓存清理完成。
- [ ] 用户确认正式版所有位置实际显示效果。

## Progress

- [x] 核对 Git、代码、用户截图和所有图标入口。
- [x] 两栏统一；软件粗绘和三种提案被用户否定，直接替换为成熟 Fluent 书本并移除失败提案。
- [x] 用户回复“就这吧”后补齐共享入口，源码提交 3ae410e。
- [x] 在中间包安装期间，用户要求文件恢复旧形状加白底；已按反馈重做，源码提交 6417832。
- [x] 最终正式包覆盖中间包、刷新关联、启动并保留发布证据，清掉 Rust 编译缓存。
- [ ] 用户验收。

## Discoveries

旧引用在 WindowTitleBar、NewTabPage 和 DocumentTypeIcon；共享 brandIcons 现覆盖所有文件组件使用位置。Windows 已安装文件不随源码自动变更，必须重建覆盖。生成 MSI 将许可保留为 licenses/LICENSE 和 licenses/LICENSE-fluent-emoji；NSIS 使用配置映射的 .txt 名称，两者都包含完整 notice。用户 .pdf/.md 默认类分别为 PDF Document、Markdown Document，五项 DefaultIcon 均核对正确。

## Verification

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

waiting：软件 Fluent 设计已被用户接受；最新文件方向已实现，正式版已启动。只检查本次内容：标题栏/首页软件书本一致；PDF/MD 标签、最近记录、拖拽及 Windows 文件为旧轮廓加白底；两栏和删除线协调。若测试删除线，PDF 用测试样本、Markdown 用临时副本。

## Risks and remaining work

实际视觉/交互待用户；Windows 可能延迟刷新缓存，通知已发出。安装包仍未签名；NSIS 安装/卸载和 Rust 测试本轮未重跑。编译缓存已清理，首次再次开发需要重编译。

## Next action

用户检查正式版图标同步与旧文件轮廓白底效果；反馈在本会话继续。

## Outcome

软件内与 Windows 已统一；软件保留 Fluent 书本，文件按最新反馈恢复旧轮廓并加不透明白底。最终 MSI 已覆盖安装运行，验证与清理完成，无 Pi 调用、会话 ID 无。实际验收后归档任务；下一独立需求应新建会话。
