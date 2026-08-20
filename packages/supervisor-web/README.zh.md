# @deepseek-ai/dsh-supervisor-web

[English](README.md) | 中文

`dsh-supervisor-web` 是可选 DSH Desktop Supervisor 的 Web 伴随包，提供一级设置页来安装和配对桌面托盘端。本地开发时可以像其他本地插件一样直接作为 profile `file:` 依赖安装；如果后续通过插件市场分发，则 `dshmarket` 仍然负责插件安装、更新、hot mount、hot restart、验证和回滚。

Host 半侧提供 `/dsh-supervisor/*` 本地路由：读取 GitHub Release manifest、选择当前平台制品、下载到 `$DSH_HOME/downloads/desktop-supervisor/`、校验 SHA-256、只打开已校验的文件或目录、读取 `$DSH_HOME/supervisor/control.json`，并用 descriptor token 转发本机 supervisor pairing。开发 profile 可配置 `localArtifactPath` 指向本地构建出的安装包；远端 manifest 不可用时，页面会把该安装包作为 `local-dev` 制品展示并原地校验。Client 半侧把 P0 入口注册到“设置 → 桌面启动”。桌面托盘端尚未安装时，该页面仍支持读取 manifest、选择本机平台安装包、下载或本地校验、打开已校验下载文件和刷新状态；restart、Safe Mode、启动失败恢复和本机进程日志需要托盘 App 运行后才可用。

## Model Experience

None, as this package only contributes browser UI and local Host routes.

#### KV Cache effect

None. 该包既不组装也不发送 provider 请求。

## Known Limitations and Deferred Work

- **P0 不做桌面进程管理** — restart、Safe Mode、启动失败解析和 Last Known Good recovery 属于后续 supervisor 阶段。
- **签名可用前仅支持 unsigned macOS** — Web UI 标记 Developer Mode 并打开已校验下载，但不会绕过 Gatekeeper，也不承诺一键安装。
