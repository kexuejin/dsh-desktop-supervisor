# DSH Desktop Supervisor Design

Status: proposed for the first implementation slice.

[English](2026-08-19-dsh-desktop-supervisor-design.md) | 中文

## Purpose

Desktop supervisor 在 `dsh web` 外增加一层系统级恢复能力，但不替代 `dshmarket`。`dshmarket` 仍然是插件安装、更新、hot mount、hot restart、验证和回滚的 lifecycle owner；supervisor 只处理 DSH 进程不可用时无法运行的进程级能力。

## Components

- `packages/supervisor-web`: 通过 `dshmarket` 安装的 DSH Web 插件。Host 半侧下载并校验桌面制品、探测本地 supervisor，并提供状态路由。Client 半侧贡献 Settings tab，展示安装引导和配对状态。
- `dsh-desktop-supervisor`: 由 GitHub Actions 构建的 Tauri 桌面应用。首个 slice 启动托盘应用，写入本地 control descriptor，并在 loopback 上提供 `/health`、`/status` 和 `/pair`。
- GitHub Releases: 桌面应用分发源。Release assets 包含 `manifest.json`、`SHA256SUMS` 和各平台安装包。Web 插件消费 manifest，不内嵌平台安装包。

## Ownership

`dshmarket` 拥有普通插件操作。supervisor 不安装也不 hot-mount DSH 插件。如果后续桌面宿主提供 `desktopProfiles` 和 `desktopPnpm`，`dshmarket` 已经会禁用自重启路径，并把 restart ownership 交给宿主。

supervisor 只在普通 DSH 启动失败时，或用户为了托盘/launch-at-login 安装桌面应用时拥有恢复职责。恢复写入使用 profile patch layer 中 row-level `disabled: true` entry，并且必须保护 DSH 基础设施 rows。

## Distribution

首个 release channel 是 `developer`。在拥有付费 Apple Developer 账号之前，macOS 构建未签名且未公证。因此 Web 插件展示手动 Developer Mode 指引：下载、打开文件或目录、使用 Finder 右键 Open 或 System Settings → Privacy & Security → Open Anyway，并避免全局禁用 Gatekeeper。

Release manifest 是持久选择源：

```json
{
  "schema": 1,
  "app": "dsh-desktop-supervisor",
  "version": "0.1.0-dev.1",
  "channel": "developer",
  "artifacts": [
    {
      "platform": "darwin",
      "arch": "arm64",
      "kind": "zip-app",
      "file": "dsh-supervisor-macos-arm64.zip",
      "url": "https://github.com/owner/dsh-desktop-supervisor/releases/download/v0.1.0-dev.1/dsh-supervisor-macos-arm64.zip",
      "sha256": "...",
      "signed": false,
      "notarized": false,
      "installMode": "manual-unsigned"
    }
  ]
}
```

Host-side download 写入 `$DSH_HOME/downloads/desktop-supervisor/<version>/`，校验 SHA-256，并且只打开已校验的 artifact 或目录。Browser-only download 保留为 fallback。

## Local Pairing

桌面应用写入：

```json
{
  "schema": 1,
  "app": "dsh-desktop-supervisor",
  "version": "0.1.0-dev.1",
  "pid": 12345,
  "url": "http://127.0.0.1:47832",
  "tokenPath": "/Users/me/.dsh/supervisor/token",
  "capabilities": ["status", "restart", "logs"]
}
```

Web 插件读取 `$DSH_HOME/supervisor/control.json`，加载 token path，并调用 loopback control API。变更类 control API 调用需要 token。首个 P0 API 以读取为主：`GET /health`、`GET /status` 和 `POST /pair`。

## Phases

- P0: Web 插件安装引导、manifest 下载、SHA-256 校验、打开下载制品、supervisor 探测、配对状态、Tauri 托盘骨架、control file 和 health/status API。
- P1: Open DSH、restart、logs 和 quit 托盘控制。
- P2: Safe Mode、启动失败解析、从 DSH 外部 row-level disable，以及 Last Known Good snapshots。
- P3: 签名/公证 release、updater、Windows/Linux installer polish 和 plugin bisection。

## Verification

- Typecheck Web 插件包并运行 focused client tests。
- 为 design 和 Agent Note 运行 `doc-sync`。
- 在 GitHub Actions 中构建 desktop supervisor；本地 Rust checks 取决于是否安装 toolchain。
- 验证 Web 插件把 unsigned macOS artifacts 报告为 Developer Mode，并且不承诺一键安装。
