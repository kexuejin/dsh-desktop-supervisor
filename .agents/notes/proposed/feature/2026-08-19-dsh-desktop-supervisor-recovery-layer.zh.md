# Agent Note: DSH desktop supervisor recovery layer

Status: proposed

[English](2026-08-19-dsh-desktop-supervisor-recovery-layer.md) | 中文

## Problem

第三方 DSH 插件可能在安装、激活或下一次 Web profile 启动时失败。`dshmarket` 已经拥有普通插件生命周期操作，包括 hot mount、hot restart、安装验证和回滚；但当 DSH 进程或 Web 页面无法启动时，它无法提供恢复入口。独立桌面托盘还需要 launch-at-login 和重启恢复等进程级职责，同时不能让桌面安装成为正常插件使用的前置条件。

## Proposal

新增 desktop supervisor recovery layer，包含两个交付物。`packages/supervisor-web` 通过 `dshmarket` 安装，用于引导桌面安装、校验 GitHub Release 制品、读取本地 supervisor 状态，并与桌面应用配对。它的 P0 DSH 入口是“设置 → 插件 → 桌面启动”。等 `dshmarket` 暴露插件详情 action slot 后，安装/启动卡片应迁到 marketplace package 旁边。`dsh-desktop-supervisor` 是一个 Tauri 应用，负责 DSH 进程外的托盘和进程恢复能力。

`dshmarket` 仍然拥有插件安装、更新、卸载、hot mount、hot restart、验证和回滚。supervisor 不替代这些流程。当桌面宿主存在时，它应满足已有 desktop-host 约定，使 `dshmarket` 禁用进程内自重启，并把进程重启交给宿主。

## Distribution and pairing

桌面制品由 GitHub Actions 生成，并以 `manifest.json` 和 `SHA256SUMS` 发布到 GitHub Releases。Web 插件消费 manifest，选择当前平台和架构的制品，下载到 Harness home，校验 SHA-256，并打开已校验的文件或目录。插件不内嵌安装包。

首个 macOS 渠道是 Developer Mode，因为当前没有付费 Apple Developer 账号。未签名、未公证的制品必须呈现为手动安装流程：下载、在 Finder 中打开、右键 Open 或到 System Settings → Privacy & Security → Open Anyway，并且不要全局关闭 Gatekeeper。

桌面应用在 `$DSH_HOME/supervisor/control.json` 写入 loopback control descriptor，并写入私有 token 文件。Web 插件读取 descriptor，并带 token 调用 supervisor loopback API。变更类调用需要 token，并且只允许 loopback。

## Alternatives considered

**把桌面安装包内嵌到 Web 插件。** 拒绝，因为多平台安装包会显著膨胀 DSH 插件、把桌面发布绑定到 Web 插件发布，并增加插件自身破坏 Web 启动的风险。

**让 supervisor 成为插件生命周期 owner。** 拒绝，因为 `dshmarket` 已经实现安装、hot mount、hot restart、验证和回滚。重做该层会拆分权威，并制造 patch 和 restart 行为冲突。

**要求桌面应用负责插件 hot restart。** 拒绝，因为 `dshmarket` 已经在普通 `dsh web` 中支持 hot restart。桌面应用只是托盘、launch-at-login 和 DSH 无法启动时恢复的可选增强。

**只发布桌面 supervisor，不提供 Web 插件。** 拒绝，因为大多数用户通过 DSH Web 和 `dshmarket` 发现并安装能力；Web 插件提供安装引导和配对入口，避免用户必须先进入独立原生流程。

## Acceptance criteria

- Web companion package is installable as a DSH plugin and contributes Settings → Plugins → Desktop launch without adding model-facing tools.
- Web companion fetches a GitHub Release manifest, selects the current platform artifact, downloads it to Harness home, verifies SHA-256, and opens only a verified download.
- macOS unsigned artifacts are labeled as Developer Mode and guide the manual Open/Open Anyway flow without recommending global Gatekeeper disablement.
- Desktop supervisor writes `$DSH_HOME/supervisor/control.json`, serves loopback health/status/pair routes, and exposes tray actions without taking over `dshmarket` plugin lifecycle duties.
- Release workflow publishes platform artifacts with `manifest.json` and `SHA256SUMS` for dynamic Web download.

## Risks

未签名 macOS 构建需要用户手动操作，容易被误认为完整安装器。Web UI 必须标记 Developer Mode，并避免承诺一键安装。恢复写入如果范围过宽，可能禁用关键 row；row-level disable 必须复用 `dshmarket` 的受保护基础设施规则或共享等价规则。supervisor 若自行启动 DSH 进程，可能与用户已经运行的进程冲突，除非它按 `$DSH_HOME` 记录所有权并加锁。
