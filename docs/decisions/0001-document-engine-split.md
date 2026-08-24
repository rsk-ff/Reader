# 0001: Split PDF reading and mutation engines

- Status: Accepted
- Date: 2026-08-13

## Context

Reader 同时需要成熟的 PDF 阅读体验和可控的本地文件修改。PDF.js 提供浏览器环境中完整的阅读层，而 PDFium 提供可靠的底层 PDF 写操作；把任一引擎强行用于另一方职责会引入额外 UI 栈或重复实现。

## Decision

- PDF.js 是读取、显示、搜索、导航、选择和打印的唯一阅读引擎。
- PDFium 只处理批注和页面修改，并通过 Rust 后端执行原子写入。
- 坐标变换以 PDF.js `PageViewport` 为准。
- 写入完成后通过文档修订号使 PDF.js 重新加载。

## Consequences

- 阅读和写入职责清楚，避免维护第二套页面渲染 UI。
- 修改后必须正确更新修订号并处理重新加载。
- PDFium 调用需要串行锁和阻塞线程隔离。

## Evidence

- 当前实现：`reader/src/documents/pdf/` 与 `reader/src-tauri/src/pdf/`。
- 原始背景：`docs/archive/initial-technical-plan.zh-CN.md`。
