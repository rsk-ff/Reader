# PDF 文字选择起点、终点及缩放修复

- Status: `done`
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

同日再次反馈“没有修复，依然会失效”：用户仅试了 Ctrl＋滚轮，未确认复制是否仍有效。`81d03ee` 的浏览器结果不足以证明真实窗口已修复；本轮补查连续滚轮、选区绘制与运行版本。

同日第三次反馈：用户确认缩放正常、起点正常；从第一行部分文字继续向下拖动时，拖到第三行（最后一行）下方仍漏选末行后半部分，必须把鼠标移回末行文字才能选全。本轮继续修复空白处的拖动终点。

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
- 末行修订前基线 `d299f12`，该轮初始工作树干净；当时起点和缩放已获用户确认，末行下方空白终点仍不符合预期。
- 最终源码基线 `c267f35`；空白起点、缩放选区保留及末行空白终点修复已交付，用户于 2026-10-05 确认整体验收。

## Expected behavior

- 从同一行左侧空白拖入文字可建立正常选区并复制。
- 从文字内部开始选择、反向选择、跨行选择及缩放后选择正常。
- 已有选区在放大、缩小、适合页面/宽度及 Ctrl＋滚轮/快捷键缩放时仍选择相同内容，可继续复制；连续滚轮与延迟页面重绘期间也保持可用及显示。
- 选择限制仅在 PDF 阅读区内调整，工具栏和其他应用区域保持现有行为。
- 从首行部分文字向下拖至末行下方空白时，包括末行剩余文字；回到末行文字上可恢复精确字符终点，不强制整行选择。

## Scope

PDF.js 阅读区样式、局部选区空白起点/终点校正及缩放保留与生命周期接入、真实 PDF 浏览器功能回归及有关产品/架构/开发/状态/变更文档。

## Out of scope

PDF 引擎替换、Rust 写操作、安装包、目录任务及 Markdown 功能。

## Constraints and decisions

- 先通过真实 PDF.js/React/CSS 与鼠标拖动复现；不使用模拟文字层代替浏览器行为。
- 复用浏览器原生选区；按用户本轮反馈补充空白终点的文字行边缘校正。文字内部终点、复制和选区绘制继续使用浏览器/PDF.js，不添加生产依赖；不修改 PDF.js 依赖文件。
- 本次为明确局部修复，由 Codex 直接完成，Pi 未调用。
- 桌面视觉与交互由用户验收；自动化不截图。

## Acceptance criteria

- [x] 浏览器测试先复现空白处开始拖动失败，再验证修复通过。
- [x] 原有文字内部拖动、反向/跨行、缩放及文字批注相关选择回归通过。
- [x] 前端全量测试、浏览器测试、生产构建及文档/diff 检查通过。
- [x] 启动实际修复版本。
- [x] 用户检查原问题 PDF 并确认结果。
- [x] 连续 Ctrl＋滚轮期间的空文字已复现并修复；自动化检查原生文字内容、复制处理器及选区绘制层，缩放已获用户确认。
- [x] 缩放修复局部验证：反向/跨行、搜索高亮重绘及重绘期间取消选区。
- [x] 用户确认缩放和拖动起点正常。
- [x] 末行下方拖动选择包含整行，回到文字后恢复精确终点，相关回归通过。
- [x] 文档更新、连贯本地提交，工作树干净（提交主题见 Outcome）。

## Progress

- [x] 恢复仓库和文档上下文，定位选择限制。
- [x] 复现并修复。
- [x] 自动化验证及本地提交。
- [x] 用户反馈的缩放丢失已复现并修复，17 项 PDF 局部浏览器测试通过。
- [x] 缩放修复全量验证、交付提交及桌面热更新检查。
- [x] 复现并处理第二次 Ctrl＋滚轮反馈，补足回归证据。
- [x] 用户确认缩放和起点；末行空白终点的复现、修订、6 项新增回归及整体验证完成。
- [x] 用户验收并归档。

## Discoveries

- 暂无与本目标匹配的活动任务；PDF 目录任务保持独立。
- 修复前真实 Edge 拖动：左侧空白起点预期 `Hello, R`、实际空字符串；文字内部起点测试通过。
- 仅对文字层设置 `user-select: text` 时仍漏掉首字：实际 `ello, R`。PDF.js 绝对定位 span 使空白按下的原生 caret 落在文字层容器尾部，而非当前行起点。
- 加入同一行最近文字边缘定位，在原生 mousedown 完成后设置初始 caret；只在本次空白拖动期间保持选区 anchor，终点与几何继续由浏览器/PDF.js 提供。单击/释放、失焦、非活动标签和卸载清理状态。
- 本机 pnpm 脚本调用会消费一个 `--`，原开发文档的双分隔符示例将 Cargo 选项混入应用参数（出现 `always` 路径警告）。已停止仅由本次任务启动的开发进程，改为直接 Tauri CLI 的双分隔符正确重启，并修正文档 pnpm 示例为三个分隔符；原有安装版进程保持运行。
- 用户反馈修订在 `c1f114a` 基线上进行，开始时工作树干净。原 8 项测试覆盖“缩放后再选字”，未覆盖“已有选区再缩放”。新加四种缩放回归均复现 `Hello, R` 变为空字符串；本地 PDF.js `#setScaleUpdatePages` 明确调用 `clearSelection()`。
- 公共缩放入口的局部清选抑制修复普通选区；搜索高亮重绘仍替换文字子节点，选区会清空。现按稳定文字 span 内的字符偏移恢复原生 anchor/focus，在重新显示文字层后释放快照；新手势、其他按键、失焦和普通清选取消快照，不复活用户取消的选区。
- 第二次反馈在 `81d03ee` 基线上继续，开始时工作树干净；用户明确只试过 Ctrl＋滚轮，未试复制。旧测试仅在单次滚轮后等待文字层可见，再断言内容，漏查滚动与重绘期间。
- 新的立即断言复现：`mouse.wheel(0, -60)` 后预期 `Hello, R`、实际空字符串；引擎的 `drawingDelay: 180` 路径会隐藏文字层，直到画布重绘结束。连续滚轮扩大了这段不可复制文字的时间。
- 缩放及延迟 `refresh` 后，使用 PDF.js 当前 viewport 立即更新选区覆盖页面的缓存文字层，并恢复字符偏移；不取消画布延迟渲染，不改变原生复制或引擎选区绘制。选区覆盖的所有页面收到正式文字层完成事件后才释放快照，避免无关页面提前取消保护。
- 补查 PDF.js `.canvasWrapper .selection` 的裁剪路径、可见性及与原生 Range 的面积重叠；页面/文字边界分别取整，因此要求重叠超过 95%，不要求两层坐标完全相等。此功能断言不替代用户目视验收。
- 桌面版本核对采用临时运行诊断：新开检查 PDF 后记录当前实例及其 `refresh` 包含即时文字更新；随后确认当前窗口未保存 Markdown 数量为 0，进行一次完整前端重载。重载后的全部已创建 PDF 实例均记录 `immediate refresh=true; full reload=true; dirty Markdown=0`，避免仅据服务端 HMR 日志判断旧实例已更新。临时诊断与重载代码已移除，不进入提交。
- 本轮末行反馈在 `d299f12` 基线上进行。按用户三行手势复现：从文字内部或左侧空白开始，首行补全和第二行部分选中正常；指针到第三行下方时预期 `Page one of the text fixture.`，实际仅 `Page one`。浏览器按水平位置保留了末行字符终点，原适配只校正空白起点。
- 本轮记录一次拖动的原生 anchor 和指针位置，仅当指针命中 PDF 文字层空白时补正 focus：越过行底取行尾、反向越过行顶取行首，同一视觉行的邻接文字片段按 DOM 顺序扩展并在引擎显式换行处停止。文字上的 focus 使用浏览器结果；指针离开文字但原生 caret 不变时，通过移动后的延迟校正更新选区。释放前供批注读取原生 Range，随后清理全部拖动状态和定时器。

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
- 第二次反馈局部：连续滚轮立即读取文字的回归先失败（`Hello, R` → 空字符串），修订后通过；PDF 局部 20 项通过，随后新增搜索状态下的复制及三页选区回归通过。跨页测试先滚动页面容器触发渲染，再等待文字层，避免等待未渲染 span。
- 第二次反馈全量：`pnpm --dir reader test` — 16 个文件、108 项通过；`pnpm --dir reader test:browser` — 31 项通过（PDF 22、Markdown 9）。新增 5 项覆盖连续滚轮放大/缩小、绘制范围、重绘期间文字与事件剪贴板复制（含搜索）、三页文字层；原取消测试改为等实际画布重绘完成再断言不恢复。
- 第二次反馈构建：为引擎声明为 any 的 render Promise 补充错误参数的 `unknown` 类型后，`pnpm --dir reader build` 通过，1172 个模块，仅既有大 chunk 警告。该类型标注不改变浏览器运行行为。
- 第二次反馈文档与 diff 检查通过：26 个 Markdown、2 项活动任务；临时诊断移除后 `PdfViewer.tsx` 与基线相同，最终代码范围只含缩放适配器和浏览器回归。
- 桌面 PID `67236` 使用检查文件 `C:\Users\fanq1\AppData\Local\Temp\Reader-Ctrl-wheel-acceptance-20261005.pdf`（测试 PDF 副本），完整前端重载后所有当前 PDF 实例的临时诊断确认即时文字更新已加载。未操作鼠标验收、未截图；原 PDF 和实际 Ctrl+C 仍待用户确认。
- 末行修订先复现两项失败，再通过 10 项局部选择/批注回归；新增 6 项最终覆盖文字内部及空白起点的三行拖动、保持按下时末行补全、搜索后的垂直空白终点与返回文字/释放稳定、反向首行补全、右侧空白终点以及完整末行高亮几何。搜索测试先将首行滚入视口；批注几何按原生 Range 校验，避免把浏览器对整行元素/文字的重复矩形误当行数。
- 末行修订全量：`pnpm --dir reader test` — 16 个文件、108 项通过；`pnpm --dir reader test:browser` — 37 项通过（PDF 28、Markdown 9），含已有全部缩放回归；`pnpm --dir reader build` — TypeScript 与生产构建通过，1172 个模块，仅既有大 chunk 警告。
- 末行桌面交付：当前 PID `67236` 新开 `C:\Users\fanq1\AppData\Local\Temp\Reader-End-selection-check-20261005.pdf`（三行测试文件副本）；确认未保存 Markdown 为 0 后完整重载前端，临时运行诊断记录 `whitespace endpoint=true; reload=true; dirty Markdown=0`。诊断/重载代码已移除，`PdfViewer.tsx` 无最终 diff。未截图、未替用户操作视觉验收；Rust 和安装包未重跑。
- 末行修订最终检查：文档检查通过（26 个 Markdown、2 项活动任务、8 项归档任务、2 项决策）；完整 diff 已核对，`git diff --check` 通过。

## User acceptance

2026-10-05 用户先反馈选字后缩放失效；第二次修订后明确确认“缩放没问题”“选中的起点没问题”，记录为缩放和起点的部分验收。随后继续反馈三行文字末行下方空白漏选后半行；终点修订 `c267f35` 完成自动化验证并加载至当前 Reader 后，用户回复“验收”，确认本任务整体通过。

交付检查清单为：从首行部分文字拖到末行下方，确认末行已全部选中；拖回末行文字上，确认终点随字符变化；释放后复制检查。用户给出整体验收，没有逐项展开或提供独立剪贴板内容记录。

## Risks and remaining work

- 本任务无待处理反馈，真实 Reader/WebView2 交互已由用户整体验收。
- 复制自动化使用隔离的事件剪贴板，未读写 Windows 剪贴板；不把用户整体验收扩写为单独记录过具体剪贴板内容。
- 本次不修改 Rust、不生成新安装包。

## Next action

本任务结束；下一个独立需求应新建会话。

## Outcome

空白起点首轮修复为 `c1f114a — fix: allow PDF text selection from page margins`，首轮缩放修订为 `81d03ee — fix: preserve PDF text selection while zooming`，第二次反馈修订为 `d299f12 — fix: keep PDF selection available during wheel repaint`，最终终点修订为 `c267f35 — fix: complete PDF text selection past line edges`。用户于 2026-10-05 整体验收通过，任务归档；验收收尾仅更新文档，不修改应用代码，不重复已通过的 108 项前端、37 项浏览器测试及生产构建。Pi 未调用，无会话 ID；未重建安装包。
