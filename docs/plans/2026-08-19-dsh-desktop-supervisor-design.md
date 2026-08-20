# DSH Desktop Supervisor Design

Status: proposed for the first implementation slice.

English | [中文](2026-08-19-dsh-desktop-supervisor-design.zh.md)

## Purpose

The desktop supervisor adds a system-owned recovery layer around `dsh web` without replacing `dshmarket`. `dshmarket` remains the plugin lifecycle owner for installs, updates, hot mounts, hot restarts, validation, and rollback while the supervisor handles process-level capabilities that cannot run when the DSH process is unavailable.

## Components

- `packages/supervisor-web`: a DSH Web plugin installed through `dshmarket`. Its Host half downloads and verifies desktop artifacts, probes a local supervisor, and exposes status routes. Its Client half contributes the P0 entry at Settings → Plugins → Desktop launch with install guidance and pairing status; once `dshmarket` exposes a plugin-detail action slot, that card should move beside the marketplace package.
- `dsh-desktop-supervisor`: a Tauri desktop app built by GitHub Actions. The first slice starts a tray app, writes a local control descriptor, and serves `/health`, `/status`, and `/pair` on loopback.
- GitHub Releases: the desktop app distribution source. Release assets include `manifest.json`, `SHA256SUMS`, and per-platform packages. The Web plugin consumes the manifest instead of embedding platform installers.

## Ownership

`dshmarket` owns ordinary plugin operations. The supervisor does not install or hot-mount DSH plugins. If a desktop host later provides `desktopProfiles` and `desktopPnpm`, `dshmarket` already disables its self-restart path and delegates restart ownership to the host.

The supervisor owns recovery only when normal DSH startup fails or when the user installs the desktop app for tray or launch-at-login behavior. Recovery writes use row-level `disabled: true` entries in the profile patch layer and must protect DSH infrastructure rows.

## Distribution

The first release channel is `developer`. macOS builds are unsigned and not notarized until a paid Apple Developer account exists. The Web plugin therefore shows manual Developer Mode instructions: download, open the file or directory, use Finder right-click Open or System Settings → Privacy & Security → Open Anyway, and avoid disabling Gatekeeper globally.

The Release manifest is the durable selection source:

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

Host-side downloads write to `$DSH_HOME/downloads/desktop-supervisor/<version>/`, verify SHA-256, and open only a verified artifact or directory. Browser-only downloads remain a fallback.

## Local Pairing

The desktop app writes:

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

The Web plugin reads `$DSH_HOME/supervisor/control.json`, loads the token path, and calls the loopback control API. Mutating control API calls require the token. The first P0 API is read-oriented: `GET /health`, `GET /status`, and `POST /pair`.

## Phases

- P0: Web plugin install guide, manifest download, SHA-256 verification, open downloaded artifact, supervisor probe, pairing status, Tauri tray skeleton, control file, and health/status API.
- P1: tray controls for Open DSH, restart, logs, and quit.
- P2: Safe Mode, startup failure parsing, row-level disable from outside DSH, and Last Known Good snapshots.
- P3: signed/notarized releases, updater, Windows/Linux installer polish, and plugin bisection.

## Verification

- Typecheck the Web plugin package and focused client tests.
- Run `doc-sync` for the design and Agent Note.
- Build the desktop supervisor in GitHub Actions; local Rust checks are optional when the toolchain is installed.
- Verify that the Web plugin reports unsigned macOS artifacts as Developer Mode and never claims one-click installation.
