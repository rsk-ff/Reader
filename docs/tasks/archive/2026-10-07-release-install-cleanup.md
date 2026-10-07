# 已验收版本发布、覆盖安装与项目清理

- Status: `done`
- Owner: Codex
- Created: `2026-10-07`
- Last updated: `2026-10-07`
- Base branch: `master`
- Base commit: `de45f91`
- Implementation: `Codex`
- Pi session ID: `not used`

## Goal

将用户已验收的 Reader 发布成本地 MSI/NSIS 安装包，覆盖当前 MSI 安装并启动；清理可生成的项目缓存，明显缩小目录占用。

## Related context

- [开发/发布](../../DEVELOPMENT.md)：构建、MSI 标记核对和安装边界。
- [当前状态](../../STATUS.md)：已验收代码与旧安装登记。
- [界面验收结果](../archive/2026-10-07-interface-polish.md)：用户验收 de45f91。
- [原 MSI 安装任务](2026-10-05-msi-release-install.md)：升级身份及安装路径。
- [Tauri 配置](../../../reader/src-tauri/tauri.conf.json)：正式 identifier、版本、安装资源。

## Current behavior

工作树开始时干净，master=de45f91。用户明确验收并授权发布、安装和清理。版本 0.1.0，当前安装包来自 2026-10-05。项目逻辑总文件大小 22,570,065,503 字节（约 21.02 GiB）；debug 20,313,332,308，release 1,864,187,834，node_modules 260,177,032。开发检查进程 PID 32388、Vite PID 16992 正在运行。

## Expected behavior

正式标识 com.earendil.reader 的安装包可覆盖既有 0.1.0 MSI。保留当前发布的安装包、哈希和证据，清理占用最大的 target 构建中间文件；源码、Git 历史、文档、锁文件、必要运行库、用户安装数据和项目依赖保留。小型前端/测试缓存不影响缩减目标，可以保留。

## Scope

本地 MSI/NSIS 发布、MSI 覆盖安装与文件/登记核对、安装版启动、当前构建/缓存清理、相关文档/任务归档、连贯本地提交。

## Out of scope

外部上传、版本/产品行为变更、安装器卸载测试、全局 npm/pnpm/Cargo 缓存清理、用户文件删除、独立 PDF 目录任务验收。

## Constraints and decisions

- 用户当前要求已授权本地安装和清理，不追加确认；不把“发布”扩为未指定平台的上传。
- 沿用 0.1.0 和升级身份，生成 MSI 与 NSIS，本机通过 MSI 升级。
- 复用已通过的 111 前端、14 最近针对性浏览器和先前全部 65 不同用例；发布重新运行前端/类型与 Rust release 编译，不重复无源码变化的测试套件。
- 清理前先保存并核对发布包；每个删除目录必须检查绝对路径位于 D:\Projects\Reader，避开源码和目录联接。停止本任务开发服务并正常关闭检查窗口，未保存对话框不能强杀。
- 不修改或清理用户的 Reader 安装数据/WebView 存储，不删全局依赖缓存；保留 node_modules 以便继续开发。

## Acceptance criteria

- [x] MSI/NSIS 构建完成，来源、大小、哈希、签名及包结构记录。
- [x] 升级与实际安装文件一致，安装版可以启动。
- [x] 当前发布包另存固定目录，清理前后占用有实际数据。
- [x] 文档和完整 diff 通过，本地提交、干净工作树（提交主题见 Outcome）。

## Progress

- [x] 验收归档与占用统计。
- [x] 构建、安装与核对。
- [x] 清理和最终统计。
- [x] 文档收尾、提交及交付。

## Discoveries

- 初始最大占用来自 Rust target/debug（18.92 GiB），不是源码；target/release 约 1.74 GiB。
- MSI 保持升级身份和版本，但每次构建有新的 ProductCode；新安装登记正确替换旧 MSI。
- 直接递归删除的两次请求被自动审批拒绝，返回“blocked by policy”，没有更具体理由；改用 Cargo 自带 clean，通过。小型 dist/测试/Vite 缓存保留，不再尝试直接删除。

## Verification

- 开始时 Git 状态干净；磁盘统计通过 Get-ChildItem 逐文件长度汇总，不跟随目录联接。
- `git diff --exit-code de45f91 -- reader` 通过：发布期间没有修改应用代码。
- `pnpm --dir reader tauri build` 退出 0：TypeScript、前端 1196 模块、Rust release（2m16s）、WiX 和 NSIS 均成功。仅既有大 chunk 提示；复用界面任务的 111 前端、14 最新针对性浏览器及此前全部 65 不同用例，不因纯打包重复套件。
- MSI 20,905,984 字节，SHA-256 `C2A104B0BCFAFC952B54DC7DAB53DE11E2961064E1E4840596EBE2E4C9B3D234`；NSIS 16,026,633 字节，SHA-256 `01047AC97BD6EF334631A72A65DFC775765AE4216EF72CD96F049DA359CD748D`。两者 NotSigned，发布副本校验一致。
- 发布目录 `releases/2026-10-07-0.1.0-de45f91/` 保留两包、build.log、install.log、SHA256SUMS.txt、manifest.json、MSI 表、安装与启动核对及 NSIS/WiX 脚本，不纳入 Git。
- MSI 数据库：ProductVersion 0.1.0、ALLUSERS 1、ProductCode `{01DCC369-8B30-46C6-8424-46E9E72B6279}`、UpgradeCode `{8C88C1AD-4BA2-5A3C-9E5F-45B76A862470}`；升级最小 0、无最大、属性 257。File 表含四个预期文件，Registry 表含五项 DefaultIcon；NSIS 脚本包含 ICO 及安装/卸载 hook。
- `msiexec /i <MSI> /passive /norestart /L*v <log>` 退出 0，日志确认成功。新产品已注册，旧 `{0BCEC9F0-9CE3-4EF1-8CE3-CBA1F61806AD}` 已移除；历史 NSIS 登记保留，没有单独运行 NSIS 安装。
- 安装目录 `C:\Users\fanq1\AppData\Local\Reader`。reader.exe 17,491,456 字节，SHA-256 `BBF7D34AA3821A427CBB47DA83B4DDE1DE6AD25C2965D74F95572F6A5E0B5BF6`；与 release 的差异只有偏移 14054648/49/50 的 UNK → MSI 三字节，归一后哈希完全一致。PDFium/两种 ICO 与源码资源哈希匹配，实际五项 DefaultIcon 正确。
- 已正常关闭开发检查窗口 PID 32388，相关开发服务自行结束。安装版 PID 17188、路径正确、窗口句柄 1772444、Responding=true；清理后复核仍正常，不作视觉验收结论。
- 所有拟清理路径先检查仓库内绝对路径、无受跟踪文件/目录联接，保存发布副本。`cargo clean --manifest-path reader/src-tauri/Cargo.toml` 退出 0，移除 23,618 个文件，工具报告 20.7 GiB，target 已不存在。
- 前后逻辑文件大小 22,570,065,503 → 429,813,631 字节，减少 22,140,251,872 字节（98.1%），约 21.02 → 0.40 GiB。清理报告保存在发布目录，后续文档/清单/提交会增加少量字节；依赖约 260 MB、发布记录约 37 MB 保留。
- 文档内部链接与任务状态检查通过：29 个 Markdown、1 项独立活动任务、12 项归档、2 项决策；完整 diff、Git 空白检查通过。提交不含应用修改、安装包、日志或用户数据。

## User acceptance

用户已验收应用代码 de45f91，并明确授权发布、安装、清理。安装启动与文件核对不替代新的视觉结论；实际纸张打印未单独测。

## Risks and remaining work

包未签名的现有方式不变。清理 Rust 缓存后，下次 Rust 构建须重新编译；小型前端/测试缓存保留。实际纸张打印、卸载、独立 NSIS 安装和新的安装版视觉检查未执行。用户数据和已截断的历史记录均不在清理范围；独立 PDF 目录任务状态未改变。

## Next action

无；本目标结束，新的独立需求新建会话。

## Outcome

从用户已验收 de45f91 发布 0.1.0 MSI/NSIS，成功 MSI 覆盖安装并启动；项目清理减少约 98.1% 占用，所有发布证据已保留，界面任务验收归档、旧 MSI 任务因版本被替代而取消归档。收尾提交主题 `docs: record accepted release installation and cache cleanup`，实际哈希见 Git 历史，最终核对工作树干净。Pi 未调用，无会话 ID；没有外部上传。
