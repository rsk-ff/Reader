# 自制打印窗口

- Status: `waiting_user_acceptance`
- Created: `2026-11-09`
- Base: `dev@5752b4a`，分支 `claude/project-thread-xntoqx`

## Goal

PDF 和 Markdown 打印不再弹 Edge 打印预览，改用 Reader 自己的打印窗口：选打印机、份数、页面范围、纸张、方向、每张页数、缩放（PDF）/页边距（Markdown）、双面、颜色、是否打印批注，并看到真实分页的预览。

## Related context

- 行为：[`PRODUCT.md`](../../PRODUCT.md) “打印”一节；数据流：[`ARCHITECTURE.md`](../../ARCHITECTURE.md) “Printing”。
- 代码：`reader/src/print/`（窗口、排版计算、偏好）、`reader/src-tauri/src/print/`（打印机、DEVMODE、GDI 打印、Markdown PrintToPdf）。
- 设计草图经用户确认（2026-11-09 线程）：左侧大预览 + 底部缩略图条，右侧选项，底部“共 N 张纸 / 取消 / 打印”。

## Scope and acceptance

- [ ] PDF、Markdown 的打印按钮和 Ctrl+P 打开新窗口，不再出现 Edge 打印预览。
- [ ] 打印机列表、默认打印机、纸张列表来自系统；不支持双面/彩色的打印机不显示对应选项。
- [ ] 页面范围（全部/当前页/自定义）、每张 1/2/4/6/9/16 页、方向、缩放、页边距、黑白在预览中即时体现，实际打印与预览一致。
- [ ] PDF 打印包含未保存的批注；取消“打印批注”后不打印批注。
- [ ] “打印机属性…”打开驱动设置，确定后窗口选项同步。
- [ ] 再次打开记住上次的打印机和设置（页面范围、份数除外）。
- [x] 自动化：`pnpm --dir reader test`、`pnpm --dir reader build`、`cargo clippy --target x86_64-pc-windows-msvc`、浏览器测试 `print-dialog.spec.ts`、`markdown-tools.spec.ts`。

## Progress and verification

- 后端 Windows 部分只在 Linux 上做了 `x86_64-pc-windows-msvc` 目标的 check/clippy，未在真实 Windows 上运行；Rust 单元测试需在 Windows 上跑。
- 浏览器测试模拟原生打印命令，PDF.js 预览与排版计算为真实代码。

## User acceptance

waiting

## Next action

在 Windows 上 `pnpm --dir reader tauri dev`，按验收项逐条检查；有问题按反馈修。
