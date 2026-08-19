# DSH Desktop Supervisor

English | [中文](README.zh.md)

DSH Desktop Supervisor is an optional cross-platform desktop companion for DSH. It owns process-level behavior that must remain available when `dsh web` is unavailable: tray status, local pairing, startup guidance, and future Safe Mode / recovery flows.

It does **not** replace `dshmarket`. Plugin install, update, hot mount, hot restart, validation, and rollback remain owned by `dshmarket`.

## Repository Layout

- `app/` — Tauri 2 tray application. P0 writes `$DSH_HOME/supervisor/control.json`, serves loopback `/health`, `/status`, and token-authenticated `/pair`, and opens DSH Web from the tray.
- `packages/supervisor-web/` — DSH Web companion plugin. It installs through DSH/plugin distribution, reads GitHub Release manifests, verifies SHA-256 downloads, opens verified artifacts, and pairs with the local tray app.
- `scripts/desktop-supervisor-manifest.mjs` — release manifest generator used by GitHub Actions.
- `docs/plans/` — design notes for ownership, distribution, pairing, and phased recovery.

## Developer Mode

The first macOS channel is unsigned and unnotarized. Users must allow it manually with Finder right-click Open or System Settings → Privacy & Security → Open Anyway. Do not disable Gatekeeper globally.

## Local Checks

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run cargo:check
pnpm run manifest:smoke
```

`pnpm run build:app` performs the real Tauri bundle path when the platform has the required native dependencies.
