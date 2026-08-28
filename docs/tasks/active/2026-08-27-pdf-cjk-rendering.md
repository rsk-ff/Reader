# 修复未嵌入中文字体 PDF 在 Reader 中只显示表格线

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-08-27`
- Last updated: `2026-08-27`
- Base branch: `master`
- Base commit: `ef2569f4272796527c7d6cb74129cdc48ab0b763`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

修复用户提供的《高校毕业生（高技能人才）来并工作租房补贴申请表(1).pdf》在 Reader 中只显示表格线、文字不可见的问题，同时不修改用户原始 PDF。

## Related context

- [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md)：PDF.js 解析与渲染边界。
- [`docs/DEVELOPMENT.md`](../../DEVELOPMENT.md)：构建、测试和视觉验收命令。
- [`reader/vite.config.ts`](../../../reader/vite.config.ts)：PDF.js 静态资源复制配置。
- [`reader/src/documents/pdf/PdfViewer.tsx`](../../../reader/src/documents/pdf/PdfViewer.tsx)：PDF.js 加载参数和资源 URL。
- 用户提供的 PDF 文件：文件名为 `高校毕业生（高技能人才）来并工作租房补贴申请表(1).pdf`，保留在用户原路径。

## Current behavior

- 原始 PDF 是有效的 2 页 A4 静态 PDF，无 AcroForm。
- 在 Reader 中，表格线和照片可见，但文字不可见。
- Poppler 渲染原文件可见中文、数字、表格线和证件照；PDF 内唯一文字字体是未嵌入的 `/STSong-Light`，文字依赖 PDF.js 的 Adobe GB1 CMap 与系统字体回退。
- 修复前构建产物把资源放在 `pdfjs/cmaps/node_modules/pdfjs-dist/cmaps/` 等嵌套路径，而 Reader 请求的是 `pdfjs/cmaps/Adobe-GB1-UCS2.bcmap`。

## Expected behavior

Reader 打开该 PDF 时，两页的中文、数字、表格线和照片都可见；滚动、文字选择和搜索不因字体资源缺失而失效；原始 PDF 文件内容不被修改。

## Scope

- 调整 [`reader/vite.config.ts`](../../../reader/vite.config.ts) 中 PDF.js CMaps、ICC、标准字体、WASM 和图片资源的构建复制路径。
- 更新当前状态、变更记录和本活动任务的验证证据。

## Out of scope

- 不修改用户原始 PDF，不做降质的图片化转换。
- 不更换 PDF.js、PDF.js 渲染架构或 Reader 的 PDF 编辑能力。
- 不处理未由本次资源路径问题导致的其他 PDF 字体兼容性问题。

## Constraints and decisions

- 以代码、构建产物和可复现渲染结果为准；原始 PDF 的有效性由 Poppler 和 PDF 结构检查共同确认。
- 使用 `rename: { stripBase: true }` 让静态复制产物与 [`PdfViewer.tsx`](../../../reader/src/documents/pdf/PdfViewer.tsx) 请求的 `/pdfjs/<目录>/` URL 一致。
- 不调用 Pi；根因已定位到具体构建配置，Codex 直接修改。
- 发布包必须基于修复后的源码重新构建，不能继续使用旧的 `dist` 或安装包。

## Acceptance criteria

- [x] 该 PDF 的未嵌入 Adobe CJK 字体文字在 PDF.js/Chromium 渲染中可见。
- [x] `pnpm --dir reader test` 和 `pnpm --dir reader build` 通过。
- [x] 构建产物的 PDF.js 资源位于运行时请求的平铺目录，错误嵌套路径不存在。
- [x] 状态、变更记录和活动任务记录已更新，临时测试文件已清理。
- [ ] 用户在真实 Reader 桌面版本中完成两页视觉/交互验收。

## Progress

- [x] 检查 Git 状态、项目文档和活动任务；开始时工作树干净且无匹配活动任务。
- [x] 核查原始 PDF 结构和 Poppler 渲染结果。
- [x] 定位 PDF.js CMap 资源路径错误。
- [x] 修改 `reader/vite.config.ts`。
- [x] 重新构建并确认资源位于 `dist/pdfjs/<目录>/` 一级路径。
- [x] 运行前端测试。
- [x] 用 Chromium 本地测试页加载同一 PDF，确认文字项可提取且文字画面可见。
- [ ] 用户验收已启动的 Reader 开发版本。

## Discoveries

- PDF.js 资源复制插件默认保留了匹配路径结构；当前配置的 `node_modules/pdfjs-dist/<目录>/*` 因此生成了多余的 `node_modules/pdfjs-dist/<目录>` 层级。
- 该 PDF 的字体资源没有 `/FontFile`，字体为 `/STSong-Light`；缺少 `Adobe-GB1-UCS2.bcmap` 时，PDF.js 仍可处理线条和图像，但文字绘制失败。
- 修复后构建产物包含 169 个 CMap、2 个 ICC、16 个标准字体、13 个 WASM 文件以及 81 个 PDF.js 图片资源，均位于预期目录。

## Verification

- `pnpm --dir reader test` — passed；11 个测试文件、89 个测试通过。
- `pnpm --dir reader build` — passed；Vite 构建成功。
- 构建产物抽查 — passed；`cmaps/Adobe-GB1-UCS2.bcmap`、`cmaps/UniGB-UCS2-H.bcmap`、`standard_fonts/LiberationSans-Regular.ttf`、`wasm/openjpeg.wasm` 存在，错误嵌套路径不存在。
- Chromium 本地渲染 — passed；`textItems=110`，第一页中文标题、表格文字和照片可见，无警告或错误。
- Tauri release build — not run；本次先完成开发版本验收。

## User acceptance

`waiting`。请在已启动的 Reader 开发版本中检查：第一页标题和各单元格文字、证件照、第一页下半部学习/工作经历；第二页奖励/惩处、本人承诺、用人单位意见和审核部门意见；并滚动到第二页、使用搜索框搜索一个可见词。关闭按钮放在检查清单最后。

## Risks and remaining work

- 尚未运行完整 Tauri release build，因此旧安装包不会自动获得修复；发布前必须重新构建并更新发布证据。
- 尚未完成真实 Windows 桌面视觉验收；若用户仍观察到缺字，需要记录页码和视图状态后继续在本任务中处理。

## Next action

用户完成已启动 Reader 中该 PDF 的两页视觉/交互验收；若仍有缺失，反馈具体页码和视图状态。

## Outcome

实现和自动化验证已完成，当前等待用户视觉/交互验收；验收完成后再归档本任务并更新最终状态。
