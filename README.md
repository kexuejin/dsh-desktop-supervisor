# DSH Desktop Supervisor

English | [中文](README.zh.md)

DSH Desktop Supervisor is an optional cross-platform desktop companion for DSH. It owns process-level behavior that must remain available when `dsh web` is unavailable: tray status, local pairing, startup guidance, normal restart, and targeted startup recovery for failed plugins.

It does **not** replace `dshmarket`. Plugin install, update, hot mount, hot restart, validation, and rollback remain owned by `dshmarket`.

## Repository Layout

- `app/` — Tauri 2 tray application. It writes `$DSH_HOME/supervisor/control.json`, serves loopback `/health`, `/status`, token-authenticated `/pair`, `/restart`, and `/disable-plugin`, opens DSH Web from the tray, restarts DSH from the captured launch descriptor when Web is unavailable, and can write a row-level `disabled: true` patch for a specific failed plugin.
- `packages/supervisor-web/` — DSH Web companion plugin. It installs through DSH/plugin distribution, reads GitHub Release manifests, verifies SHA-256 downloads, opens verified artifacts, pairs with the local tray app, and writes `$DSH_HOME/supervisor/launch.json` so the desktop app can restart or recover DSH externally.
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
