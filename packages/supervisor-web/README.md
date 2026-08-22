# @deepseek-ai/dsh-supervisor-web

English | [中文](README.zh.md)

The desktop-supervisor Web companion adds a top-level Settings page for installing and pairing the optional DSH Desktop Supervisor. During local development it can be installed directly as a profile `file:` dependency; when distributed through the plugin marketplace, `dshmarket` remains responsible for plugin installation, updates, hot mounting, hot restart, validation, and rollback.

The Host half serves `/dsh-supervisor/*` loopback routes that read a GitHub Release manifest, select the current platform artifact, download it under `$DSH_HOME/downloads/desktop-supervisor/`, verify SHA-256, open the verified file or directory when the platform can do so, read `$DSH_HOME/supervisor/control.json`, forward pairing, restart, update-check, and update-install requests to the local supervisor with the descriptor token, diagnose plugin ids from startup error text, and forward targeted disable requests for a specific failed plugin. A development profile may set `localArtifactPath` to a locally built installer; when the remote manifest is unavailable, the page exposes that installer as a `local-dev` artifact and verifies it in place. The Client half registers the entry at Settings → Desktop launch. Before the desktop tray app is installed, the page still supports manifest lookup, platform artifact selection, download or local verification, checksum verification, opening a verified download, and status refresh; restart and targeted startup recovery require the tray app to be running.

## Model Experience

None, as this package only contributes browser UI and local Host routes.

#### KV Cache effect

None. The package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Targeted recovery is not a blanket safe profile** — startup diagnosis proposes plugin ids from error text and recovery disables one selected non-infrastructure plugin before the user retries restart.
- **Unsigned macOS only until signing exists** — the Web UI labels Developer Mode and opens the verified download, but it does not bypass Gatekeeper or claim one-click installation.
- **Self-update starts at dev.3** — `dev.2` and earlier builds do not contain updater code and must be replaced manually once.
