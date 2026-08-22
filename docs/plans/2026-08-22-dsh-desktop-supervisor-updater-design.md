# DSH Desktop Supervisor Updater Design

## Goal

DSH Desktop Supervisor uses Tauri updater for tray-app self-updates instead of a hand-rolled binary replacement flow. The Web companion keeps `manifest.json` for first install and manual downloads when the tray app is absent, while the installed tray app reads `latest.json` and validates Tauri signatures before installing an update.

## Release Metadata

GitHub Releases publish two metadata files:

- `manifest.json` lists human-installable artifacts and SHA-256 digests for the DSH Web companion.
- `latest.json` follows the Tauri updater static format: `version`, `notes`, `pub_date`, and `platforms[target] = { url, signature }`.

The release workflow collects Tauri `.sig` files, keeps them attached to the release, and generates `latest.json` only from signed updater artifacts. The Tauri app embeds the updater public key in `tauri.conf.json`; GitHub Actions receives the private key through `TAURI_SIGNING_PRIVATE_KEY`, with `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` only needed for password-protected keys.

## Runtime Flow

The tray app registers `tauri-plugin-updater` and exposes two token-authenticated loopback routes:

- `POST /check-update` checks `latest.json` and returns whether a newer signed artifact is available.
- `POST /install-update` repeats the check, downloads and verifies the selected artifact, installs it, and requests a tray-app relaunch.

The tray menu includes “Check for Updates” and “Install Update and Relaunch”. From `0.1.0-dev.4`, a manual tray check shows a native dialog: up-to-date and error states are explicit, while available updates require user confirmation before install and relaunch. The Web companion proxies the same operations as `/dsh-supervisor/check-update` and `/dsh-supervisor/install-update`, so Settings → Desktop launch can operate the tray updater without exposing the token to browser code.

## Compatibility

`0.1.0-dev.3` is the first build with updater support. `dev.2` and older installations cannot self-update and must be replaced manually once. Later signed builds can update through the tray app. Windows self-update requires an installer bundle such as NSIS or MSI; the release workflow now builds NSIS on Windows instead of treating the portable exe as an updater target.

## Verification

Non-restart verification covers TypeScript typecheck, route tests for updater proxy calls, manifest smoke coverage for `latest.json`, Rust formatting, Rust `cargo check`, Web bundle output, and diff whitespace checks. Development verification must not invoke real local DSH restarts unless explicitly requested.
