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

改善用户截图中 Windows 软件/文件图标透出桌面、占比过大的表现，并统一 PDF/Markdown 右侧工具图形和删除线。

## Related context

- [Product](../../PRODUCT.md)
- [Development](../../DEVELOPMENT.md)
- [Icon sources](../../../reader/src/assets/icons/README.md)
- [Generator](../../../scripts/generate-file-association-icons.mjs)
- [PDF tools](../../../reader/src/documents/pdf/PdfToolbar.tsx)
- [Markdown tools](../../../reader/src/documents/markdown/MarkdownTools.tsx)
- [Shared rail](../../../reader/src/components/DocumentToolRail.tsx)

## Current behavior

系统 ICO 从应用内透明轮廓直接生成，图形几乎占满画布。PDF 使用 24px 自绘描边，Markdown 使用 16px Bootstrap 填充遮罩；删除线图形也不同。

## Expected behavior

系统图标有可辨识实心主体和留边，保留外部透明区域；文件使用白色纸面、折角及紧凑格式标记。两种工具栏采用相同图标来源、18px 图形和按钮样式，删除线共用简洁 S/横线图形。

## Scope

本地图标 SVG、生成资源/脚本、PDF/Markdown 工具栏图标接入、针对性验证及文档。

## Out of scope

工具功能、文档写入、目录任务和编辑器行为；本轮不发布或覆盖安装正式版本。

## Constraints and decisions

不增加依赖；保留许可、多尺寸 ICO 与应用 256px 首帧。系统 SVG 独立于应用内 SVG，保留用户已认可的小图标。Codex 直接实现，不调用 Pi，不截图或桌面自动化验收。

## Acceptance criteria

- [ ] 系统图标填实主体、缩小占比，用户确认桌面实际效果。
- [x] 两种工具栏共用样式/图形与删除线，原操作自动化通过；美观由用户判断。
- [x] 图标生成、资源解码、针对性浏览器、类型/构建与文档检查通过。
- [x] 启动可检查开发版；本地提交主题 `style: refine shell icons and unify document tool rails`，工作树状态以 Git 为准。

## Progress

- [x] 核对干净工作树、用户截图、当前图标和两套工具接入。
- [x] 实现及验证。
- [ ] 用户验收。

## Discoveries

- 已安装正式版来自 de45f91；图标源码变更不会自动更新 Explorer 缓存或已安装程序。
- 上轮已清空 Rust target，启动原生检查版需完整重编译。
- 系统主体使用独立 shell SVG；应用内标记未变。PDF 工具改用和 Markdown 相同的遮罩组件；插页加号分别位于纸面上/下部，折角方向一致。
- Tauri 开发子进程工作目录为 src-tauri，初次相对 PDF 参数找不到文件；改用绝对路径通过单实例转发补开，开发文档同步纠正。

## Verification

- `pnpm --dir reader generate:file-icons` — 通过；应用 PNG/ICO/ICNS 与两个文件 ICO 重新生成。
- ICO 二进制/.NET 解码检查 — 三者各 6 帧，边界有效、应用 256px 首帧；中心 alpha=255、外角 alpha=0。256px 不透明边界：软件 40,40..204,215；两种文件 48,26..197,219。实际帧预览保存为系统临时目录的 reader-icon-preview.png、reader-file-pdf-preview.png、reader-file-markdown-preview.png。
- `pnpm --dir reader test:browser -- markdown-tools.spec.ts pdf-selection.spec.ts` — 首轮 38/41；两项页面加载超过 30s，一项原 PDF 手势中间补全未及时出现。新图标/一致性用例通过。
- `pnpm --dir reader test:browser -- --last-failed --workers=1` — 3/3 通过，无测试或选择代码改动；共 41 个不同用例有通过记录。
- `pnpm --dir reader test src/documents/markdown/MilkdownCrepe.test.tsx` — 8/8 通过。
- `pnpm --dir reader build` — TypeScript 与最终生产构建通过，1204 模块，既有大 chunk 提示。
- Tauri dev（临时配置）— 3m49s 编译完成；identifier=com.earendil.reader.icons20261007，窗口 Reader · 图标调整验收，PID 17580，句柄 460768、Responding=True。样本：临时 Markdown 副本和绝对路径 text-3.pdf；首次相对路径错误已补开。
- `scripts/check-docs.ps1` 与 `git diff --check` — 通过；最终提交前再检查。

## User acceptance

waiting：

- 检查版的任务栏软件图标是否大小适中、实心主体清晰；文件系统图标先看上述 PNG 帧预览（正式关联尚未更新）。
- 切换 PDF/Markdown，确认右栏笔画、尺寸与颜色协调；两者删除线是否清楚。
- 如需试删除线，PDF 仅使用测试样本；Markdown 使用临时副本，选字点删除线后可撤销。

## Risks and remaining work

Windows 可能缓存旧关联图标；正式版本更换需重新打包安装。本轮未重建安装器或 Rust 测试，未修改 Rust 源码。首轮三个浏览器失败均复跑通过，原手势在并发运行下的稳定性未在此图标任务扩展调查。视觉最终由用户验收；验收后清理开发缓存需先保留检查程序并正常关闭窗口。

## Next action

等待用户对系统图标预览/任务栏及两种右栏给出验收反馈；据反馈修订同一任务。

## Outcome

实现与自动化验证完成，独立检查版运行中；未发布或覆盖正式安装。无 Pi 调用，会话 ID 无。用户验收后归档本任务。
