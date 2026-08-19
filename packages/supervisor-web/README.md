# @deepseek-ai/dsh-supervisor-web

English | [中文](README.zh.md)

The desktop-supervisor Web companion adds an install and pairing card for the optional DSH Desktop Supervisor. It is installed through `dshmarket`; `dshmarket` remains responsible for plugin installation, updates, hot mounting, hot restart, validation, and rollback.

The Host half serves `/dsh-supervisor/*` loopback routes that read a GitHub Release manifest, select the current platform artifact, download it under `$DSH_HOME/downloads/desktop-supervisor/`, verify SHA-256, open the verified file or directory when the platform can do so, read `$DSH_HOME/supervisor/control.json`, and forward pairing to the local supervisor with the descriptor token. The Client half registers a Settings tab that shows manifest, download, unsigned macOS guidance, and pairing status.

## Model Experience

None, as this package only contributes browser UI and local Host routes.

#### KV Cache effect

None. The package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No desktop process management in P0** — restart, Safe Mode, startup-failure parsing, and Last Known Good recovery belong to later supervisor phases.
- **Unsigned macOS only until signing exists** — the Web UI labels Developer Mode and opens the verified download, but it does not bypass Gatekeeper or claim one-click installation.
