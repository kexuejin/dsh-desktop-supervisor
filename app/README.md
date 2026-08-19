# DSH Desktop Supervisor

English | [中文](README.zh.md)

This Tauri app is the optional process-level companion for DSH Web. The P0 app starts a system tray entry, writes `$DSH_HOME/supervisor/control.json`, and exposes a loopback status API for `@deepseek-ai/dsh-supervisor-web`.

It does not replace `dshmarket`. Plugin install, update, hot mount, hot restart, validation, and rollback stay in `dshmarket`.

## P0 API

- `GET /health` → `{ "ok": true }`
- `GET /status` → supervisor and DSH URL status
- `POST /pair` → token-authenticated pairing acknowledgement

## macOS Developer Mode

The first channel is unsigned and unnotarized. Use it for local development only until Developer ID signing and notarization are available.
