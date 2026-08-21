/** Chinese copy for the desktop launch entry. */
export const zh = {
  tab: '桌面启动',
  loading: '正在读取桌面启动状态…',
  error: '无法读取桌面启动状态',
  retry: '重试',
  title: '桌面启动',
  subtitle: '这里保留最常用的两个动作：重启 DSH，以及安装或打开高级系统托盘工具。',
  restartTitle: '重启 DSH',
  restartCopy: '用于 Web 卡住、插件更新后需要重新加载，或想快速重启当前 DSH Web 进程。',
  restartButton: '重启 DSH',
  restarting: '正在请求重启 DSH…',
  restartQueued: 'DSH 正在重启，页面稍后会自动刷新。',
  trayTitle: '高级系统托盘工具',
  trayConnected: '托盘工具已运行，可从系统托盘管理 DSH。',
  trayReady: '安装包已下载并校验完成，可以打开安装。',
  trayAvailable: '可安装系统托盘工具，获得开机启动、托盘状态和后续恢复能力。',
  trayUnavailable: '当前平台暂未提供系统托盘工具安装包。',
  trayPreparing: '正在准备系统托盘工具…',
  installTrayTool: '安装托盘工具',
  openTrayInstaller: '打开安装包',
  connectTray: '连接托盘工具',
  refresh: '刷新',
  trayNote: '高级托盘工具是可选项；只想重启 DSH 时不需要安装它。',
} satisfies Record<string, string>

/** Locale keys used by the desktop launch entry. */
export type SupervisorLocaleKey = keyof typeof zh

/** English copy for the desktop launch entry. */
export const en = {
  tab: 'Desktop launch',
  loading: 'Reading desktop launch status…',
  error: 'Cannot read desktop launch status',
  retry: 'Retry',
  title: 'Desktop launch',
  subtitle: 'This page keeps two common actions: restart DSH, and install or open the advanced tray tool.',
  restartTitle: 'Restart DSH',
  restartCopy: 'Use this when Web is stuck, after plugin updates, or whenever the current DSH Web process should reload.',
  restartButton: 'Restart DSH',
  restarting: 'Requesting DSH restart…',
  restartQueued: 'DSH is restarting. This page will refresh shortly.',
  trayTitle: 'Advanced tray tool',
  trayConnected: 'The tray tool is running and can manage DSH from the system tray.',
  trayReady: 'The installer is downloaded and verified. Open it to install.',
  trayAvailable: 'Install the tray tool for startup, tray status, and future recovery features.',
  trayUnavailable: 'No tray-tool installer is available for this platform yet.',
  trayPreparing: 'Preparing the tray tool…',
  installTrayTool: 'Install tray tool',
  openTrayInstaller: 'Open installer',
  connectTray: 'Connect tray tool',
  refresh: 'Refresh',
  trayNote: 'The tray tool is optional; restarting DSH does not require installing it.',
} satisfies Record<SupervisorLocaleKey, string>
