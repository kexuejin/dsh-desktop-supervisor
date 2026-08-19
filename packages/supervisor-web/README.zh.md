# @deepseek-ai/dsh-supervisor-web

[English](README.md) | 中文

`dsh-supervisor-web` 是可选 DSH Desktop Supervisor 的 Web 伴随包。它通过 `dshmarket` 安装；`dshmarket` 仍然负责插件安装、更新、hot mount、hot restart、验证和回滚。

Host 半侧提供 `/dsh-supervisor/*` 本地路由：读取 GitHub Release manifest、选择当前平台制品、下载到 `$DSH_HOME/downloads/desktop-supervisor/`、校验 SHA-256、只打开已校验的文件或目录、读取 `$DSH_HOME/supervisor/control.json`，并用 descriptor token 转发本机 supervisor pairing。Client 半侧注册一个 Settings tab，展示 manifest、下载状态、未签名 macOS 引导和配对状态。

## Model Experience

None, as this package only contributes browser UI and local Host routes.

#### KV Cache effect

None. 该包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **P0 不做桌面进程管理** — restart、Safe Mode、启动失败解析和 Last Known Good recovery 属于后续 supervisor 阶段。
- **签名可用前仅支持 unsigned macOS** — Web UI 标记 Developer Mode 并打开已校验下载，但不会绕过 Gatekeeper，也不承诺一键安装。
