# 发布已验收侧栏版本并覆盖安装

- Status: `done`
- Owner: Codex
- Created: `2026-10-09`
- Last updated: `2026-10-09`
- Base branch: `master`
- Base commit: `b2c1553`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

按用户“验收，发布，覆盖安装”的授权，生成正式 0.1.0 MSI/NSIS 并本机覆盖安装，核对交付资源；解释最近打开列表为何在每次新安装后看似清空，并核对本次升级保留正式历史。

## Related context

- [DEVELOPMENT](../../DEVELOPMENT.md) — 正式构建、同版本升级、资源核对。
- [PRODUCT](../../PRODUCT.md)、[ARCHITECTURE](../../ARCHITECTURE.md)。
- [最近列表存储](../../../reader/src/workspace/recentFiles.ts)、[工作区读取](../../../reader/src/workspace/store.ts)。
- [正式配置](../../../reader/src-tauri/tauri.conf.json)、[NSIS hook](../../../reader/src-tauri/windows/installer-hooks.nsh)。

## Current behavior

侧栏 b2c1553 已获用户验收。检查版独立标识 com.earendil.reader.sidebar20261009、开发地址 localhost:1420；正式版标识 com.earendil.reader、打包页面地址不同。最近列表只在前端 localStorage 保存。安装前工作树干净。

## Expected behavior

正式安装包含已验收侧栏。MSI 升级保留正式版历史；诊断区分独立检查版与正式版的存储隔离和真实删除，不把猜测当原因。

## Scope

侧栏任务验收归档、正式构建/安装/交付核对、最近列表只读诊断和必要的数据保护，发布证据与项目状态。

## Out of scope

无授权外部上传、全局缓存清理、跨身份自动合并验收样本历史、无关图标/PDF 目录任务验收。

## Constraints and decisions

- 保持正式标识和版本 0.1.0；包与证据保存 releases/2026-10-09-0.1.0-b2c1553。
- 正常关闭 Reader，保留未保存文档，不能强杀以绕过保存。
- 只检查 Reader 最近列表键与相应存储，不读取无关凭据。
- 不调用 Pi；本机安装已获授权，必要 UAC 由 Windows 处理。

## Acceptance criteria

- [x] MSI/NSIS 构建、包哈希与资源/关联核对完成。
- [x] MSI 覆盖安装成功，安装程序与资源匹配，正式窗口响应正常。
- [x] 最近历史安装前后检查与来源诊断有可复现证据。
- [x] 相关文档更新，发布记录归档，连贯提交与干净工作树（主题见 Outcome）。

## Progress

- [x] 确认侧栏用户验收及发布授权，读 Git/文档和存储代码。
- [x] 构建及历史诊断。
- [x] 安装、交付核对和归档。

## Discoveries

- recentFiles.ts 的 reader.recent-files.v1 只读写 window.localStorage；无独立 JSON 历史文件。
- 当前正式与侧栏检查版的 LocalAppData WebView2 目录分别存在且各自包含最近列表键。
- 已保存 MSI 模板无 WebView2 用户数据删除，NSIS 的删除应用数据只在用户勾选且非升级时执行。
- 只读解析 Reader localStorage 的 LevelDB 日志：正式标识 com.earendil.reader 的 http://tauri.localhost 键含 20 条；检查标识 com.earendil.reader.sidebar20261009 的 http://localhost:1420 键含 3 条。列表仍存在，证据支持独立身份/地址切换导致看似清空，不支持当前正式历史被删。
- 保存 history-before.json（含记录，用于安装前后比较）及 history-probe.mjs 于忽略 Git 的本轮发布目录；解析仅筛选 reader.recent-files.v1，不读取其他键值。

## Verification

- `pnpm --dir reader tauri build` — exit 0；TypeScript/Vite 1207 模块，Rust release 4m32s，WiX/NSIS 两 bundle 成功。此前应用测试已通过，不为纯发布重复：111 前端、最新 8 侧栏浏览器；原 Rust 源码未改，Rust 测试本轮未重复。
- MSI 20,930,560 字节，SHA256 F2816B7826322C8FBB4B9CCA5A86A55809FA67BC27621073DCA34FF71695244D；NSIS 16,040,985 字节，SHA256 9A6EA5B12BA4325AA86DBFCA9D35683D6D61451E98FDAAD764A6B7F8FE55EB5D；均 NotSigned。
- MSI 数据库：0.1.0、ALLUSERS=1、ProductCode {6086E093-4DCB-43D5-B45C-B7145776D844}、UpgradeCode {8C88C1AD-4BA2-5A3C-9E5F-45B76A862470}、Upgrade 属性 257，10 文件及五项 DefaultIcon。生成 NSIS 包含两 ICO 资源及安装 hook 引用、仅勾选且非更新时删应用数据。
- 两个 Reader 窗口按正常关闭路径退出，未强杀/丢弃未保存 Markdown；检查服务停止。
- 通过 Windows RunAs 授权启动 MSI `/qn /norestart` 覆盖安装，退出 0；新产品状态 5、旧 d7c2aab {10802324-E9D6-443D-942B-117D518E76D0} 状态 -1。首次 PS7 COM ProductState 参数包装类型不匹配，改为显式 string 后核对成功；安装本身未失败或重跑。
- `verify-installed.mjs` — exe 17,497,600 字节，SHA256 E9394AA6C26A25FF51560C219E459358ACE35EEB385D0F851814BFEF532B30BB，源 UNK/安装 MSI 标记归一后逐字节一致；两 ICO/PDFium/六许可或 notice 共九项资源哈希全部匹配，五项注册表文件关联正确。
- 正式应用启动 PID 55468、标题 Reader、非零句柄 1050600、响应正常；仅读取窗口元数据，无截图/桌面自动化。
- `history-probe.mjs` 与 `compare-history.mjs` — 正式 profile 的 http://tauri.localhost 历史在安装前、后、启动后均 20 条，JSON 内容完全一致；侧栏检查版 http://localhost:1420 为 3 条，保持独立。正式 LevelDB 文件已备份，LOCK 除外；没有向实际用户数据写入诊断内容。
- 所有构建/安装/哈希/存储诊断证据保存在本轮 releases。文档检查与 git diff 检查通过，最终提交前再核对。

## User acceptance

2026-10-09 用户已验收侧栏并授权发布、覆盖安装；不扩大为其他活动任务验收。

## Risks and remaining work

安装包未签名；NSIS 安装/卸载及 Rust 测试未重跑。最近列表仍按 WebView2 用户目录/页面地址隔离，本次未自动合并检查版样本到正式历史。当前正式覆盖升级保留历史已验证，不能扩大为对每次历史安装方式的复现结论。本轮未清理构建缓存，发布包已独立保存。

## Next action

任务完成；下一个独立需求新建会话。

## Outcome

已发布本地包并成功覆盖安装用户已验收的侧栏 b2c1553；正式历史 20 条安装/启动前后完全保留。源码未额外修改，本轮仅文档记录验收/发布与存储隔离原因；最终本地提交主题 `docs: record sidebar acceptance and installed release`，哈希以 Git 历史为准。Pi 未调用，无会话 ID；未上传外部平台。
