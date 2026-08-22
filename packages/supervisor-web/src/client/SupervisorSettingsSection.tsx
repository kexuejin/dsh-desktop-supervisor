import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SupervisorStatusSnapshot, SupervisorUpdateSnapshot } from '../types.ts'
import css from './SupervisorSettingsSection.module.css'

export interface SupervisorSettingsSectionInjected {
  status: () => Promise<SupervisorStatusSnapshot>
  restartDsh: () => Promise<unknown>
  download: () => Promise<unknown>
  openDownload: () => Promise<unknown>
  connect: () => Promise<unknown>
  checkUpdate: () => Promise<SupervisorUpdateSnapshot>
  installUpdate: () => Promise<SupervisorUpdateSnapshot>
}

export type SupervisorSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'supervisor.web'>
  & InjectFace<SupervisorSettingsSectionInjected>

type RefreshState =
  | { state: 'idle' }
  | { state: 'refreshing' }
  | { state: 'error'; message: string }

type ActionStatus =
  | { state: 'idle' }
  | { state: 'working'; message: string }
  | { state: 'error'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function trayStatus(snapshot: SupervisorStatusSnapshot, t: SupervisorSettingsSectionProps['t']): string {
  if (snapshot.connected) return t('trayConnected')
  if (snapshot.download.verified) return t('trayReady')
  if (snapshot.selected !== null) return t('trayAvailable')
  return t('trayUnavailable')
}

export function SupervisorSettingsSection(props: SupervisorSettingsSectionProps): ReactNode {
  const { status, restartDsh, download, openDownload, connect, checkUpdate, installUpdate, t } = props
  const [snapshot, setSnapshot] = useState<SupervisorStatusSnapshot | null>(null)
  const [refreshState, setRefreshState] = useState<RefreshState>({ state: 'idle' })
  const [action, setAction] = useState<ActionStatus>({ state: 'idle' })
  const [update, setUpdate] = useState<SupervisorUpdateSnapshot | null>(null)

  const refresh = (): void => {
    setRefreshState({ state: 'refreshing' })
    void status().then(
      (next) => {
        setSnapshot(next)
        setRefreshState({ state: 'idle' })
      },
      (error) => { setRefreshState({ state: 'error', message: errorMessage(error) }) },
    )
  }

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    return () => { window.clearInterval(timer) }
  }, [status])

  const runRestart = (): void => {
    setAction({ state: 'working', message: t('restarting') })
    void restartDsh().then(
      () => {
        setAction({ state: 'working', message: t('restartQueued') })
        window.setTimeout(() => { window.location.reload() }, 1800)
      },
      (error) => { setAction({ state: 'error', message: errorMessage(error) }) },
    )
  }


  const runCheckUpdate = (): void => {
    setAction({ state: 'working', message: t('checkingUpdate') })
    void checkUpdate().then(
      (result) => {
        setUpdate(result)
        setAction({ state: 'idle' })
      },
      (error) => { setAction({ state: 'error', message: errorMessage(error) }) },
    )
  }

  const runInstallUpdate = (): void => {
    setAction({ state: 'working', message: t('installingUpdate') })
    void installUpdate().then(
      (result) => {
        setUpdate(result)
        setAction({ state: 'working', message: t('updateInstalled') })
      },
      (error) => { setAction({ state: 'error', message: errorMessage(error) }) },
    )
  }

  const runTrayTool = (snapshot: SupervisorStatusSnapshot): void => {
    setAction({ state: 'working', message: t('trayPreparing') })
    const task = snapshot.connected
      ? connect()
      : snapshot.download.verified
        ? openDownload()
        : download().then(() => openDownload())
    void task.then(
      () => status(),
    ).then(
      (next) => {
        setSnapshot(next)
        setRefreshState({ state: 'idle' })
        setAction({ state: 'idle' })
      },
      (error) => { setAction({ state: 'error', message: errorMessage(error) }) },
    )
  }

  const busy = action.state === 'working'
  const canUseTrayTool = snapshot !== null && (snapshot.connected || snapshot.download.verified || snapshot.selected !== null)
  const trayButton = snapshot === null
    ? t('installTrayTool')
    : snapshot.connected
      ? t('connectTray')
      : snapshot.download.verified
        ? t('openTrayInstaller')
        : t('installTrayTool')
  const trayMessage = snapshot === null
    ? refreshState.state === 'error'
      ? t('trayStatusUnavailable')
      : t('trayRefreshing')
    : trayStatus(snapshot, t)
  const updateText = update === null ? null : update.available === true
    ? t('updateAvailable').replace('{version}', update.version ?? '')
    : update.installed === true
      ? t('updateInstalled')
      : t('updateCurrent')
  const refreshMessage = refreshState.state === 'refreshing'
    ? t('refreshing')
    : refreshState.state === 'error'
      ? `${t('error')}: ${refreshState.message}`
      : null

  return (
    <div className={css.section}>
      <div className={css.hero}>
        <div>
          <h3>{t('title')}</h3>
          <p>{t('subtitle')}</p>
        </div>
      </div>

      <div className={css.tiles}>
        <section className={css.tile}>
          <div>
            <h4>{t('restartTitle')}</h4>
            <p>{t('restartCopy')}</p>
          </div>
          <button className={css.primaryButton} type="button" onClick={runRestart} disabled={busy}>
            {t('restartButton')}
          </button>
        </section>

        <section className={css.tile}>
          <div>
            <h4>{t('trayTitle')}</h4>
            <p>{trayMessage}</p>
          </div>
          <div className={css.inlineActions}>
            <button className={css.secondaryButton} type="button" onClick={() => { if (snapshot !== null) runTrayTool(snapshot) }} disabled={busy || !canUseTrayTool}>
              {trayButton}
            </button>
            {snapshot?.connected === true ? (
              <button className={css.ghostButton} type="button" onClick={runCheckUpdate} disabled={busy}>
                {t('checkUpdate')}
              </button>
            ) : null}
            {snapshot?.connected === true && update?.available === true ? (
              <button className={css.ghostButton} type="button" onClick={runInstallUpdate} disabled={busy}>
                {t('installUpdate')}
              </button>
            ) : null}
            <button className={css.ghostButton} type="button" onClick={refresh} disabled={busy || refreshState.state === 'refreshing'}>
              {t('refresh')}
            </button>
          </div>
          {refreshMessage !== null ? <p className={refreshState.state === 'error' ? css.error : css.status}>{refreshMessage}</p> : null}
          {updateText !== null ? <p className={css.status}>{updateText}</p> : null}
        </section>
      </div>

      <p className={css.note}>{t('trayNote')}</p>
      {action.state !== 'idle' ? <p className={action.state === 'error' ? css.error : css.status}>{action.message}</p> : null}
    </div>
  )
}
