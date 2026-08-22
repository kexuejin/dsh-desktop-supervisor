# DSH Launch Recovery Design

Status: implemented MVP behavior.

## Purpose

DSH Desktop Supervisor must recover `dsh web` when the Web process is unavailable or startup fails because one plugin breaks the profile. Normal restart remains the fastest path, and recovery must avoid disabling every plugin because that hides the real failure and interrupts development.

## Startup Sources

The Web companion writes `$DSH_HOME/supervisor/launch.json` during normal startup. This descriptor captures process facts: pid, executable path, argv, working directory, selected profile, patch files, app arguments, and the minimal environment needed to preserve `DSH_HOME`, `PATH`, `NODE_PATH`, and shell resolution. It is authoritative when the supervisor Web plugin was installed and DSH reached the Web runtime.

If no descriptor exists, the desktop supervisor can only use conservative fallback behavior. The implemented restart path first calls the live Web restart route, then reads `launch.json` and spawns the captured command when Web is unreachable.

## Restart and Recovery

Normal restart calls the live Web restart route first. If the route is unreachable, the tray app reads `launch.json` and spawns the captured command.

Targeted recovery is separate from restart. The Web companion accepts startup error text at `/dsh-supervisor/diagnose`, extracts candidate plugin ids, filters DSH infrastructure plugins, and returns candidates for the recovery UI or caller. It does not restart DSH.

When a specific plugin is selected, `/dsh-supervisor/disable-plugin` forwards `{ pluginId, reason }` to the tray loopback `/disable-plugin` route using the paired bearer token. The tray app writes a row-level `disabled: true` entry for that plugin into the captured profile's `cordis.patch.yml`. Protected DSH infrastructure plugins are rejected. The user can then retry restart when ready.

## Verification

Focused coverage proves that the Web companion writes the launch descriptor, exposes it in status, extracts plugin candidates without returning protected infrastructure ids, and forwards targeted disable requests with the bearer token and JSON body. Desktop checks prove the Rust tray code formats and typechecks. Development verification must not restart the running DSH service unless explicitly requested.
