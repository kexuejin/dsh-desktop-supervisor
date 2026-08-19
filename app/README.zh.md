# DSH Desktop Supervisor

[English](README.md) | 中文

该 Tauri 应用是 DSH Web 的可选进程级伴随程序。P0 应用启动系统托盘入口，写入 `$DSH_HOME/supervisor/control.json`，并为 `@deepseek-ai/dsh-supervisor-web` 暴露 loopback status API。

它不替代 `dshmarket`。插件安装、更新、hot mount、hot restart、验证和回滚仍由 `dshmarket` 负责。

## P0 API

- `GET /health` → `{ "ok": true }`
- `GET /status` → supervisor 和 DSH URL 状态
- `POST /pair` → token 认证的配对确认

## macOS Developer Mode

首个渠道未签名也未公证。在 Developer ID 签名和公证可用前，只用于本地开发。
