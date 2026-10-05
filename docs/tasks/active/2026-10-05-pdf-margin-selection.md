# PDF 文字左侧空白处拖动选择修复

- Status: `waiting_user_acceptance`
- Owner: Codex
- Created: `2026-10-05`
- Last updated: `2026-10-05`
- Base branch: `master`
- Base commit: `2cd42cb`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

用户可从 PDF 页面文字左侧空白处按住鼠标并向右拖动选择文字，不必精确按在文字上。

2026-10-05 用户继续反馈：选字后缩放会使已选内容失效；本任务继续修复缩放期间的选区保留。

## Related context

- [`../../PRODUCT.md`](../../PRODUCT.md) — PDF 复制文本及批注行为。
- [`../../DEVELOPMENT.md`](../../DEVELOPMENT.md) — 测试和桌面启动方式。
- [`../../../reader/src/styles.css`](../../../reader/src/styles.css) — 应用选择限制与 PDF.js 文字层样式。
- [`../../../reader/src/documents/pdf/PdfViewer.tsx`](../../../reader/src/documents/pdf/PdfViewer.tsx) — PDF.js 实例与批注入口。
- [`../../../reader/src/documents/pdf/pdfMarginSelection.ts`](../../../reader/src/documents/pdf/pdfMarginSelection.ts) — 空白起点的原生选区校正。
- [`../../../reader/src/documents/pdf/SelectionPreservingPdfViewer.ts`](../../../reader/src/documents/pdf/SelectionPreservingPdfViewer.ts) — PDF.js 缩放选区保留与搜索高亮子节点重绘处理。
- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) — PDF 选择与渲染边界。
- [`../../../reader/src/documents/pdf/PdfAnnotationLayer.tsx`](../../../reader/src/documents/pdf/PdfAnnotationLayer.tsx) — 文字批注使用浏览器选区。
- [`../../../reader/playwright.config.ts`](../../../reader/playwright.config.ts) — 真实 Edge 功能测试，无截图、视频或 trace。

## Current behavior

- 用户报告：从文字左侧空白处按住向右拖动无法选择；从文字上按住拖动可以。
- 工作树初始干净；代码对 html/body/root 设置 `user-select: none`，PDF.js 只对文字 span/br 设置 `user-select: text`，文字层空白区域继承应用限制。

## Expected behavior

- 从同一行左侧空白拖入文字可建立正常选区并复制。
- 从文字内部开始选择、反向选择、跨行选择及缩放后选择正常。
- 已有选区在放大、缩小、适合页面/宽度及 Ctrl＋滚轮/快捷键缩放后仍选择相同内容，可继续复制。
- 选择限制仅在 PDF 阅读区内调整，工具栏和其他应用区域保持现有行为。

## Scope

PDF.js 阅读区样式、局部选区起点校正及缩放保留与生命周期接入、真实 PDF 浏览器功能回归及有关产品/架构/开发/状态/变更文档。

## Out of scope

PDF 引擎替换、Rust 写操作、安装包、目录任务及 Markdown 功能。

## Constraints and decisions

- 先通过真实 PDF.js/React/CSS 与鼠标拖动复现；不使用模拟文字层代替浏览器行为。
- 复用浏览器原生选区；仅补充空白处的文字行边缘定位和固定起点，不自建拖动终点、复制或选区绘制算法，不添加生产依赖。
- 本次为明确局部修复，由 Codex 直接完成，Pi 未调用。
- 桌面视觉与交互由用户验收；自动化不截图。

## Acceptance criteria

- [x] 浏览器测试先复现空白处开始拖动失败，再验证修复通过。
- [x] 原有文字内部拖动、反向/跨行、缩放及文字批注相关选择回归通过。
- [x] 前端全量测试、浏览器测试、生产构建及文档/diff 检查通过。
- [x] 启动实际修复版本。
- [ ] 用户检查原问题 PDF 并确认结果。
- [x] 复现并修复选字后缩放丢失选区，覆盖按钮、快捷键、滚轮和适合模式。
- [x] 缩放修复局部验证：反向/跨行、搜索高亮重绘及重绘期间取消选区。
- [x] 文档更新、连贯本地提交，工作树干净（提交主题见 Outcome）。

## Progress

- [x] 恢复仓库和文档上下文，定位选择限制。
- [x] 复现并修复。
- [x] 自动化验证及本地提交。
- [x] 用户反馈的缩放丢失已复现并修复，17 项 PDF 局部浏览器测试通过。
- [x] 缩放修复全量验证、交付提交及桌面热更新检查。
- [ ] 用户验收并归档。

## Discoveries

- 暂无与本目标匹配的活动任务；PDF 目录任务保持独立。
- 修复前真实 Edge 拖动：左侧空白起点预期 `Hello, R`、实际空字符串；文字内部起点测试通过。
- 仅对文字层设置 `user-select: text` 时仍漏掉首字：实际 `ello, R`。PDF.js 绝对定位 span 使空白按下的原生 caret 落在文字层容器尾部，而非当前行起点。
- 加入同一行最近文字边缘定位，在原生 mousedown 完成后设置初始 caret；只在本次空白拖动期间保持选区 anchor，终点与几何继续由浏览器/PDF.js 提供。单击/释放、失焦、非活动标签和卸载清理状态。
- 本机 pnpm 脚本调用会消费一个 `--`，原开发文档的双分隔符示例将 Cargo 选项混入应用参数（出现 `always` 路径警告）。已停止仅由本次任务启动的开发进程，改为直接 Tauri CLI 的双分隔符正确重启，并修正文档 pnpm 示例为三个分隔符；原有安装版进程保持运行。
- 用户反馈修订在 `c1f114a` 基线上进行，开始时工作树干净。原 8 项测试覆盖“缩放后再选字”，未覆盖“已有选区再缩放”。新加四种缩放回归均复现 `Hello, R` 变为空字符串；本地 PDF.js `#setScaleUpdatePages` 明确调用 `clearSelection()`。
- 公共缩放入口的局部清选抑制修复普通选区；搜索高亮重绘仍替换文字子节点，选区会清空。现按稳定文字 span 内的字符偏移恢复原生 anchor/focus，在重新显示文字层后释放快照；新手势、其他按键、失焦和普通清选取消快照，不复活用户取消的选区。

## Verification

- `pnpm --dir reader test:browser -- pdf-selection.spec.ts` — passed：8 项；左/右空白、文字内部、已有选区后重选、空白单击及随后原生选择、跨行、缩放/第 2 页及高亮 quads。无截图。
- `pnpm --dir reader test` — passed：16 个文件、108 项。
- `pnpm --dir reader test:browser` — passed：17 项，含上述 8 项 PDF 及既有 9 项 Markdown。
- `pnpm --dir reader build` — passed：TypeScript 与 Vite，1171 个模块，仅既有大 chunk 警告。
- `powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1` — passed：26 个 Markdown、2 项活动任务。
- `git diff --check` — passed。
- `node node_modules/@tauri-apps/cli/tauri.js dev --config <临时配置> -- -- <临时 PDF>`（cwd=`reader/`）— 开发编译通过并正确运行；临时配置仅覆盖 `identifier=com.earendil.reader.pdf-selection-acceptance-20261005`，不修改仓库配置。最终启动 PID `67236`，可见窗口句柄非零，加载 `C:\Users\fanq1\AppData\Local\Temp\Reader-PDF-selection-check-20261005.pdf`（`text-3.pdf` 副本）。重启后的日志无前端错误或错误文件参数。
- 反馈修订：`pnpm --dir reader test:browser -- pdf-selection.spec.ts` — passed：17 项，包括新增 9 项已有选区缩放相关回归。验证内容、反向 anchor/focus、随比例更新的原生选区宽度、搜索高亮重绘、重绘期间主动取消及页面跳转清选；无截图。
- 反馈修订全量：`pnpm --dir reader test` — 108 项通过；`pnpm --dir reader test:browser` — 26 项通过（PDF 17、Markdown 9）。
- 反馈修订构建：首次 TypeScript 检查指出 PDF.js 声明的 viewer 可为空、继承 getter 必须保持 string 类型；已补空值检查并匹配父类声明。最终 `pnpm --dir reader build` 通过，1172 个模块，仅既有大 chunk 警告。
- 空值保护/类型修正后 `pnpm --dir reader test:browser -- pdf-selection.spec.ts --grep zoom` 再次通过 10 项相关回归。
- 当前开发 PID `67236` 继续运行，窗口句柄非零；Vite 热更新记录包含 `PdfViewer.tsx`，新适配模块及引用模块均返回 200，日志未记录新增前端初始化错误。未截图或替用户验收。

## User acceptance

2026-10-05 用户反馈：选字后缩放会使选区失效；修订已完成自动化验证并热更新开发窗口，待复验。

waiting：在当前修复版窗口使用原问题 PDF。先选择一段文字，再用放大/缩小、Ctrl＋滚轮和适合页面/宽度切换检查选区是否仍保留，复制确认内容一致；再检查空白起点、跨行，以及单击空白取消后不会恢复旧选区。视觉和真实 WebView2 交互尚未由用户确认通过。

## Risks and remaining work

- 真实 Reader/WebView2 交互等待用户验收。
- 本次不修改 Rust、不生成新安装包。

## Next action

等待用户复验已有选区缩放后的保留及原空白起点选择；通过后记录验收并归档，仍有问题则在本任务继续复现与修复。

## Outcome

空白起点首轮修复为 `c1f114a — fix: allow PDF text selection from page margins`。选字后缩放修订提交主题为 `fix: preserve PDF text selection while zooming`，实际哈希以 Git 历史为准。用户验收待完成，当前任务保留 active。
