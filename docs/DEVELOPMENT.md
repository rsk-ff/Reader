# Development and release

## Requirements

- Windows 11 或兼容 Windows 环境。
- Node.js、pnpm 和 Rust toolchain。
- Microsoft WebView2。
- `reader/src-tauri/lib/bin/pdfium.dll`；该运行库已跟踪在仓库中。

以下命令均从仓库根目录 `D:\Projects\Reader` 执行。

## Install and run

```powershell
pnpm --dir reader install
pnpm --dir reader tauri dev
```

开发服务器使用 `http://localhost:1420`。若启动失败，先确认没有旧 Reader、Vite、Cargo 或 Rust 构建进程占用端口或 target 文件锁。

打开测试文件：

```powershell
pnpm --dir reader tauri dev -- tests/fixtures/text-3.pdf tests/fixtures/gfm.md
```

## Automated verification

按风险从局部到完整执行：

```powershell
pnpm --dir reader test
pnpm --dir reader build
cargo test --manifest-path reader/src-tauri/Cargo.toml
cargo fmt --manifest-path reader/src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path reader/src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
```

只改文档时不重复运行应用测试；需要检查 Markdown 链接、Git diff 和工作树状态。

文档结构与内部链接检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-docs.ps1
```

## Visual acceptance

视觉与交互必须在真实 Windows 桌面环境中验收；职责、启动方式和反馈记录遵循 [`AGENTS.md`](../AGENTS.md#user-visual-acceptance)，检查项保存在对应活动任务文件中。

## Release build

生成全部 Windows bundle：

```powershell
pnpm --dir reader tauri build
```

典型输出：

```text
reader/src-tauri/target/release/bundle/nsis/Reader_<version>_x64-setup.exe
reader/src-tauri/target/release/bundle/msi/Reader_<version>_x64_en-US.msi
```

发布前至少记录：源提交、版本、构建退出码、安装包大小、SHA-256、签名状态，以及安装/升级/卸载是否实际验证。证据写入对应发布任务，仍影响当前使用的限制同步到 `docs/STATUS.md`。

## Repository layout

```text
Reader/
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── scripts/
│   └── check-docs.ps1
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT.md
│   ├── STATUS.md
│   ├── PI_WORKFLOW.md
│   ├── PI_EXECUTOR_PROTOCOL.md
│   ├── decisions/
│   ├── tasks/
│   └── archive/
└── reader/
    ├── src/                    React/TypeScript frontend
    ├── src-tauri/              Rust/Tauri backend and bundle config
    └── tests/fixtures/         PDF and Markdown test files
```
