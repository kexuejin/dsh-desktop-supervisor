# DSH Desktop Supervisor

English | [中文](README.zh.md)

DSH Desktop Supervisor is an optional cross-platform desktop companion for DSH. It owns process-level behavior that must remain available when `dsh web` is unavailable: tray status, local pairing, startup guidance, normal restart, and targeted startup recovery for failed plugins.

It does **not** replace `dshmarket`. Plugin install, update, hot mount, hot restart, validation, and rollback remain owned by `dshmarket`.

## Repository Layout

- `app/` — Tauri 2 tray application. It writes `$DSH_HOME/supervisor/control.json`, serves loopback `/health`, `/status`, token-authenticated `/pair`, `/restart`, `/disable-plugin`, `/check-update`, and `/install-update`, opens DSH Web from the tray, restarts DSH from the captured launch descriptor when Web is unavailable, can write a row-level `disabled: true` patch for a specific failed plugin, and installs signed tray-app updates through Tauri updater.
- `packages/supervisor-web/` — DSH Web companion plugin. It installs through DSH/plugin distribution, reads GitHub Release manifests, verifies SHA-256 downloads, opens verified artifacts, pairs with the local tray app, and writes `$DSH_HOME/supervisor/launch.json` so the desktop app can restart or recover DSH externally.
- `scripts/desktop-supervisor-manifest.mjs` — manual installer manifest generator used by GitHub Actions.
- `scripts/desktop-supervisor-updater-manifest.mjs` — Tauri updater `latest.json` generator from signed release artifacts and `.sig` files.
- `docs/plans/` — design notes for ownership, distribution, pairing, and phased recovery.

## Developer Mode

The first macOS channel is unsigned and unnotarized. Users must allow it manually with Finder right-click Open or System Settings → Privacy & Security → Open Anyway. Do not disable Gatekeeper globally.

## Updates

Release builds publish two metadata files: `manifest.json` for DSH Web installation/download when the tray app is absent, and `latest.json` for the tray app's signed self-update flow. `0.1.0-dev.3` is the first build that contains updater code, so older `dev.2` installs must be replaced manually once; later builds can be checked and installed from the tray menu or the Settings → Desktop launch page. GitHub Actions requires `TAURI_SIGNING_PRIVATE_KEY`; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is optional for password-protected keys.

## Local Checks

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run cargo:check
pnpm run manifest:smoke
```

`pnpm run build:app` performs the real Tauri bundle path when the platform has the required native dependencies.
