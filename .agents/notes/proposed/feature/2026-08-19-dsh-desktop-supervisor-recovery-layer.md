# Agent Note: DSH desktop supervisor recovery layer

Status: proposed

English | [中文](2026-08-19-dsh-desktop-supervisor-recovery-layer.zh.md)

## Problem

Third-party DSH plugins can fail during installation, activation, or the next Web profile boot. `dshmarket` already owns ordinary plugin lifecycle operations, including hot mounting, hot restart, install validation, and rollback, but it cannot help when the DSH process or Web page does not start. A separate desktop tray also needs process-level responsibilities such as launch-at-login and restart recovery without making desktop installation a prerequisite for normal plugin use.

## Proposal

Add a desktop supervisor recovery layer with two deliverables. `packages/supervisor-web` is installed through `dshmarket`; it guides desktop installation, verifies GitHub Release artifacts, reads local supervisor status, and pairs with the desktop app. Its P0 DSH entry is Settings → Plugins → Desktop launch. When `dshmarket` exposes a plugin-detail action slot, the install/start card should move beside the marketplace package. `dsh-desktop-supervisor` is a Tauri app that owns tray and process-recovery capabilities outside the DSH process.

`dshmarket` remains the owner of plugin install, update, uninstall, hot mount, hot restart, validation, and rollback. The supervisor does not replace those flows. When desktop hosting is present, it should satisfy the existing desktop-host contract that makes `dshmarket` disable in-process self-restart and defer process restarts to the host.

## Distribution and pairing

Desktop artifacts are produced by GitHub Actions and published to GitHub Releases with `manifest.json` and `SHA256SUMS`. The Web plugin consumes the manifest, selects the current platform and architecture, downloads to the Harness home, verifies SHA-256, and opens the verified file or directory. The plugin does not embed installers.

The first macOS channel is Developer Mode because there is no paid Apple Developer account. Unsigned and unnotarized artifacts must be presented as manual installs: download, open in Finder, right-click Open or use System Settings → Privacy & Security → Open Anyway, and do not disable Gatekeeper globally.

The desktop app writes a loopback control descriptor under `$DSH_HOME/supervisor/control.json` and a private token file. The Web plugin reads that descriptor and calls the supervisor loopback API with the token. Mutating calls require the token and remain loopback-only.

## Alternatives considered

**Embed desktop installers inside the Web plugin.** Rejected because platform installers would bloat a DSH plugin, couple desktop releases to Web plugin releases, and increase the chance that the plugin itself breaks Web startup.

**Make the supervisor the plugin lifecycle owner.** Rejected because `dshmarket` already implements install, hot mount, hot restart, validation, and rollback. Reimplementing that layer would split authority and create conflicting patch and restart behavior.

**Require the desktop app for plugin hot restart.** Rejected because `dshmarket` already supports hot restart in ordinary `dsh web`. The desktop app is an optional enhancement for tray, launch-at-login, and recovery when DSH cannot start.

**Ship only a desktop supervisor with no Web plugin.** Rejected because most users discover and install capabilities through DSH Web and `dshmarket`; the Web plugin provides the installation guide and pairing surface without forcing users into a separate native flow first.

## Acceptance criteria

- Web companion package is installable as a DSH plugin and contributes Settings → Plugins → Desktop launch without adding model-facing tools.
- Web companion fetches a GitHub Release manifest, selects the current platform artifact, downloads it to Harness home, verifies SHA-256, and opens only a verified download.
- macOS unsigned artifacts are labeled as Developer Mode and guide the manual Open/Open Anyway flow without recommending global Gatekeeper disablement.
- Desktop supervisor writes `$DSH_HOME/supervisor/control.json`, serves loopback health/status/pair routes, and exposes tray actions without taking over `dshmarket` plugin lifecycle duties.
- Release workflow publishes platform artifacts with `manifest.json` and `SHA256SUMS` for dynamic Web download.

## Risks

Unsigned macOS builds require manual user action and can be mistaken for a finished installer. The Web UI must label them as Developer Mode and avoid wording that promises one-click installation. Recovery writes can disable critical rows if implemented too broadly; row-level disable must reuse the protected-infrastructure rules from `dshmarket` or a shared equivalent. A supervisor that starts its own DSH process can conflict with an already-running user-owned process unless it records ownership and locks by `$DSH_HOME`.
