# DSH Desktop Supervisor

[English](README.md) | 中文

DSH Desktop Supervisor 是 DSH 的可选跨平台桌面伴随应用。它负责在 `dsh web` 不可用时仍需存在的进程级能力：托盘状态、本地配对、启动引导、普通重启，以及针对失败插件的定点启动恢复。

它**不替代** `dshmarket`。插件安装、更新、hot mount、hot restart、验证和回滚仍由 `dshmarket` 拥有。

## 仓库结构

- `app/` — Tauri 2 托盘应用。它写入 `$DSH_HOME/supervisor/control.json`，提供 loopback `/health`、`/status`、token 认证的 `/pair`、`/restart`、`/disable-plugin`、`/check-update` 和 `/install-update`，可从托盘打开 DSH Web，在 Web 不可用时按已捕获的启动描述重启 DSH，可为指定失败插件写入 row-level `disabled: true` patch，并通过 Tauri updater 安装已签名的托盘 App 更新。
- `packages/supervisor-web/` — DSH Web 伴随插件。它通过 DSH／插件分发安装，读取 GitHub Release manifest，校验 SHA-256 下载，打开已校验制品，与本机托盘应用配对，并写入 `$DSH_HOME/supervisor/launch.json`，让桌面应用可在外部重启或恢复 DSH。
- `scripts/desktop-supervisor-manifest.mjs` — GitHub Actions 使用的手动安装 manifest 生成器。
- `scripts/desktop-supervisor-updater-manifest.mjs` — 从已签名 release 制品和 `.sig` 文件生成 Tauri updater `latest.json`。
- `docs/plans/` — ownership、分发、配对和分阶段恢复设计。

## Developer Mode

首个 macOS 渠道未签名也未公证。用户需要通过 Finder 右键 Open，或 System Settings → Privacy & Security → Open Anyway 手动允许。不要全局禁用 Gatekeeper。

## 更新

Release 会发布两个元数据文件：`manifest.json` 供未安装托盘 App 时在 DSH Web 内下载/打开安装包，`latest.json` 供托盘 App 走签名自更新。`0.1.0-dev.3` 是第一个包含 updater 代码的版本，因此旧的 `dev.2` 需要手动替换一次；之后的版本可从托盘菜单或“设置 → 桌面启动”里检查并安装。GitHub Actions 需要配置 `TAURI_SIGNING_PRIVATE_KEY`；如果私钥带密码，再配置可选的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

## 本地检查

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run cargo:check
pnpm run manifest:smoke
```

当当前平台具备所需原生依赖时，`pnpm run build:app` 会运行真实 Tauri 打包路径。
