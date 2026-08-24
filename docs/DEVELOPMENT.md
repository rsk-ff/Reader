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

## Visual acceptance

Codex 完成自动化验证后启动当前可执行版本，并给用户一份与本次改动直接相关的简短清单。用户在真实 Windows 桌面上检查视觉和交互，反馈由 Codex 写入活动任务文件。关闭应用的检查项放在最后。

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

发布前至少记录：源提交、版本、构建退出码、安装包大小、SHA-256、签名状态，以及安装/升级/卸载是否实际验证。当前 `0.1.0` 安装包未签名。

## Repository layout

```text
Reader/
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── docs/
│   ├── PRODUCT.md
│   ├── ARCHITECTURE.md
│   ├── DEVELOPMENT.md
│   ├── STATUS.md
│   ├── PI_WORKFLOW.md
│   ├── decisions/
│   ├── tasks/
│   └── archive/
└── reader/
    ├── src/                    React/TypeScript frontend
    ├── src-tauri/              Rust/Tauri backend and bundle config
    └── tests/fixtures/         PDF and Markdown test files
```
