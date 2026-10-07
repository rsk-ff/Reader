# Windows and document rail icon refinement

- Status: `in_progress`
- Owner: Codex
- Created: `2026-10-07`
- Last updated: `2026-10-07`
- Base branch: `master`
- Base commit: `d2aede2`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

改善用户截图中 Windows 软件/文件图标透出桌面、占比过大的表现，并统一 PDF/Markdown 右侧工具图形和删除线。

## Related context

- [Product](../../PRODUCT.md)
- [Development](../../DEVELOPMENT.md)
- [Icon sources](../../../reader/src/assets/icons/README.md)
- [Generator](../../../scripts/generate-file-association-icons.mjs)
- [PDF tools](../../../reader/src/documents/pdf/PdfToolbar.tsx)
- [Markdown tools](../../../reader/src/documents/markdown/MarkdownTools.tsx)
- [Shared rail](../../../reader/src/components/DocumentToolRail.tsx)
- [Shared brand icons](../../../reader/src/components/brandIcons.ts)

## Current behavior

系统 ICO 从应用内透明轮廓直接生成，图形几乎占满画布。PDF 使用 24px 自绘描边，Markdown 使用 16px Bootstrap 填充遮罩；删除线图形也不同。

## Expected behavior

系统图标有可辨识实心主体和留边，保留外部透明区域；最新用户明确要求文件恢复之前的 Bootstrap 轮廓、字母与颜色，仅添加纸张内部不透明白底，取消格式色块。两种工具栏采用相同图标来源、18px 图形和按钮样式，删除线共用简洁 S/横线图形。

## Scope

本地图标 SVG、生成资源/脚本、PDF/Markdown 工具栏图标接入、针对性验证及文档。

## Out of scope

工具功能、文档写入、目录任务和编辑器行为；为完成 Windows 所有位置图标更新，本轮允许重新打包并本机覆盖安装，不外部发布。

## Constraints and decisions

不增加依赖；保留许可、多尺寸 ICO 与应用 256px 首帧。最新用户要求所有位置更新，应用内与 Windows 改为共用同一 SVG 母版，只有显示尺寸不同。Codex 直接实现，不调用 Pi，不截图或桌面自动化验收。

## Acceptance criteria

- [ ] 系统图标填实主体、缩小占比，用户确认桌面实际效果。
- [x] 两种工具栏共用样式/图形与删除线，原操作自动化通过；美观由用户判断。
- [x] 图标生成、资源解码、针对性浏览器、类型/构建与文档检查通过。
- [x] 启动可检查开发版；本地提交主题 `style: refine shell icons and unify document tool rails`，工作树状态以 Git 为准。

## Progress

- [x] 核对干净工作树、用户截图、当前图标和两套工具接入。
- [x] 实现及验证。
- [ ] 用户验收。
- [x] 用户否定实心软件图标后，重新绘制三种白色书页/文档方案，提供实际小尺寸图标预览；尚未接入程序。
- [x] 用户进一步否定粗糙设计及候选流程后，直接采用 Microsoft Fluent 完整书本图形并更新原生检查版；移除失败提案源文件。
- [x] 用户接受 Fluent 软件图标，要求软件内部及所有文件图标同步；代码入口已核对，正在统一引用并准备正式安装更新。
- [x] 用户在安装过程中要求文件恢复旧设计，仅纸张内部填白；PDF/MD 完整路径和原配色已恢复，共享入口保持，生成/六帧检查和 5 项浏览器测试通过。3ae410e 中间包已安装成功，将由本次最终包覆盖。

## Discoveries

- 已安装正式版来自 de45f91；图标源码变更不会自动更新 Explorer 缓存或已安装程序。
- 上轮已清空 Rust target，启动原生检查版需完整重编译。
- 系统主体使用独立 shell SVG；应用内标记未变。PDF 工具改用和 Markdown 相同的遮罩组件；插页加号分别位于纸面上/下部，折角方向一致。
- Tauri 开发子进程工作目录为 src-tauri，初次相对 PDF 参数找不到文件；改用绝对路径通过单实例转发补开，开发文档同步纠正。
- 2026-10-07 用户反馈“这个软件图标太丑了”，否定当前实心书本；不据此推断其余图标已通过。新候选位于 reader/src/assets/icons/proposals，A 为展开书页、B 为文档与折角、C 为简洁书签；建议 A，尚待用户选择。应用内、当前 shell-reader.svg、生成资源及安装版本均未被候选替换。
- 后续用户强烈否定上一轮交付。无需用户选方向：直接采用 Microsoft Fluent Emoji Open book / Color，来源固定为 e8a613a0baedbca8f144fa70950714f2583318a8，MIT 许可保存为 LICENSE-fluent-emoji。shell-reader.svg 保留上游完整路径、渐变和过滤器，以 x=4 放置到 40×40 画布，减少占比并使实际主体居中；输入原始 SHA256 与出处见图标 README。已删提案文件，历史保留 Git；应用内紧凑标记、文件 ICO 和两栏工具未再改动。
- Tauri bundle 资源映射携带微软版权/许可至 licenses/fluent-emoji.txt；正式安装器尚未重建，发布时应核对该 notice。
- 最新用户反馈“就这吧，但是很多地方都没更新，软件里的软件图标，以及所有地方的文件图标”：接受 Fluent 软件设计，要求同步所有位置。遗漏原因是 WindowTitleBar/NewTabPage 仍引用 journal-bookmark-fill.svg，DocumentTypeIcon 仍引用 filetype-pdf/md.svg；原生生成器只使用 shell SVG，已安装 ICO 也未覆盖。采用共享 brandIcons.ts 接入三个母版，覆盖标题栏、首页、标签、最近记录、前端拖拽预览和原生拖拽窗口；HTML favicon 同步。只调整图片画布显示尺寸以补偿母版留边，保留标题栏、标签与窗口按钮固定几何。

## Verification

- `pnpm --dir reader generate:file-icons` — 通过；应用 PNG/ICO/ICNS 与两个文件 ICO 重新生成。
- ICO 二进制/.NET 解码检查 — 三者各 6 帧，边界有效、应用 256px 首帧；中心 alpha=255、外角 alpha=0。256px 不透明边界：软件 40,40..204,215；两种文件 48,26..197,219。实际帧预览保存为系统临时目录的 reader-icon-preview.png、reader-file-pdf-preview.png、reader-file-markdown-preview.png。
- `pnpm --dir reader test:browser -- markdown-tools.spec.ts pdf-selection.spec.ts` — 首轮 38/41；两项页面加载超过 30s，一项原 PDF 手势中间补全未及时出现。新图标/一致性用例通过。
- `pnpm --dir reader test:browser -- --last-failed --workers=1` — 3/3 通过，无测试或选择代码改动；共 41 个不同用例有通过记录。
- `pnpm --dir reader test src/documents/markdown/MilkdownCrepe.test.tsx` — 8/8 通过。
- `pnpm --dir reader build` — TypeScript 与最终生产构建通过，1204 模块，既有大 chunk 提示。
- Tauri dev（临时配置）— 3m49s 编译完成；identifier=com.earendil.reader.icons20261007，窗口 Reader · 图标调整验收，PID 17580，句柄 460768、Responding=True。样本：临时 Markdown 副本和绝对路径 text-3.pdf；首次相对路径错误已补开。
- `scripts/check-docs.ps1` 与 `git diff --check` — 通过；最终提交前再检查。
- 软件图标返工提案 — 三个 SVG 均使用现有 Tauri CLI 在系统临时目录生成成功；.NET 解码三个 ICO 的 24/32/48px 帧，并在对应像素大小绘制到 proposals/preview.png（720×400），无新增依赖。程序逻辑未改，不重复应用测试或编译。提交主题 `design: propose replacement Reader application icons`。
- Fluent 软件标记替换 — 生成命令成功，应用 PNG/ICO/ICNS 更新；.NET 实际解码 256/64/48/32/24/16 全部六帧，尺寸/数据边界正确，中心 alpha=255、外角 alpha=0，256px 首帧保留。SVG 无 script、foreignObject 或外部图像引用。
- 开发检查版自动重编译 — 10.66s 通过，PID 7588、Responding=True；枚举元数据确认 Reader · 图标调整验收 可见窗口句柄 395220，PDF 已补发绝对路径。未截图/自动化视觉验收；未重复浏览器测试或打包安装，因为本轮仅软件图标资产改变。
- 加入许可资源后原生编译 — 13.65s 通过，最新 PID 24540 响应正常，绝对 PDF 参数再次补发；debug/licenses/fluent-emoji.txt 与许可源文件 SHA256 相同。固定提交原始 SVG 下载核对哈希并复原画布包装，确认未改上游图形内容。
- 文件 ICO、组件、工具逻辑和浏览器测试源码 — 与前一提交无差异。本地提交主题 `style: adopt Fluent book artwork for the Reader app icon`。
- 全位置同步 — `pnpm --dir reader test:browser -- new-tab.spec.ts` 最终 5/5 通过：标题栏/首页同源、PDF/MD 标签/最近列表同源、6 个图像实际解码、纸面/格式色、330/620/1100px 布局与近期滚动；标题栏 36px、原生按钮 46px 保留。首轮仅新测试对 SVG 引号形式的字符串断言失败，改用 XML 属性断言后通过，无显示问题。
- 全位置同步源码提交主题 `fix: synchronize application and file icons across surfaces`；正式打包、安装及关联刷新待执行。

## User acceptance

waiting：

- 最新反馈：用户回复“就这吧”，接受当前 Fluent 软件设计，并要求补齐应用内软件图标及所有文件图标；统一母版接入已完成，Windows 安装同步进行中。两栏与文件图标尚未单独声明验收。
- 检查版的任务栏软件图标是否大小适中、实心主体清晰；文件系统图标先看上述 PNG 帧预览（正式关联尚未更新）。
- 切换 PDF/Markdown，确认右栏笔画、尺寸与颜色协调；两者删除线是否清楚。
- 如需试删除线，PDF 仅使用测试样本；Markdown 使用临时副本，选字点删除线后可撤销。

## Risks and remaining work

Windows 可能缓存旧关联图标；正式版本更换需重新打包安装。本轮未重建安装器或 Rust 测试，未修改 Rust 源码。首轮三个浏览器失败均复跑通过，原手势在并发运行下的稳定性未在此图标任务扩展调查。视觉最终由用户验收；验收后清理开发缓存需先保留检查程序并正常关闭窗口。

## Next action

重新构建保留旧文件轮廓与白底的最终 MSI/NSIS，覆盖安装中间版本并核对所有图标资源与关联。

## Outcome

粗绘软件标记和三种候选均已被成熟 Fluent 书本图形替代；图标资源全部生成并验证，原生检查版已更新运行，等待实际视觉反馈。未发布或覆盖正式安装。无 Pi 调用，会话 ID 无。整体用户验收后归档本任务。
