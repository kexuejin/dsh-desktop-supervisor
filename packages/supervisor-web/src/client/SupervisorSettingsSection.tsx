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

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: SupervisorStatusSnapshot }

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
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [action, setAction] = useState<ActionStatus>({ state: 'idle' })
  const [update, setUpdate] = useState<SupervisorUpdateSnapshot | null>(null)

  const refresh = (): void => {
    setState({ status: 'loading' })
    void status().then(
      (snapshot) => { setState({ status: 'ready', snapshot }) },
      (error) => { setState({ status: 'error', message: errorMessage(error) }) },
    )
  }

  useEffect(refresh, [status])

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
        setState({ status: 'ready', snapshot: next })
        setAction({ state: 'idle' })
      },
      (error) => { setAction({ state: 'error', message: errorMessage(error) }) },
    )
  }

  if (state.status === 'loading') {
    return <div className={css.section}>{t('loading')}</div>
  }
  if (state.status === 'error') {
    return (
      <div className={css.section}>
        <p className={css.error}>{t('error')}: {state.message}</p>
        <button className={css.secondaryButton} type="button" onClick={refresh}>{t('retry')}</button>
      </div>
    )
  }

  const snapshot = state.snapshot
  const busy = action.state === 'working'
  const canUseTrayTool = snapshot.connected || snapshot.download.verified || snapshot.selected !== null
  const trayButton = snapshot.connected ? t('connectTray') : snapshot.download.verified ? t('openTrayInstaller') : t('installTrayTool')
  const updateText = update === null ? null : update.available === true
    ? t('updateAvailable').replace('{version}', update.version ?? '')
    : update.installed === true
      ? t('updateInstalled')
      : t('updateCurrent')

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
            <p>{trayStatus(snapshot, t)}</p>
          </div>
          <div className={css.inlineActions}>
            <button className={css.secondaryButton} type="button" onClick={() => { runTrayTool(snapshot) }} disabled={busy || !canUseTrayTool}>
              {trayButton}
            </button>
            {snapshot.connected ? (
              <button className={css.ghostButton} type="button" onClick={runCheckUpdate} disabled={busy}>
                {t('checkUpdate')}
              </button>
            ) : null}
            {snapshot.connected && update?.available === true ? (
              <button className={css.ghostButton} type="button" onClick={runInstallUpdate} disabled={busy}>
                {t('installUpdate')}
              </button>
            ) : null}
            <button className={css.ghostButton} type="button" onClick={refresh} disabled={busy}>
              {t('refresh')}
            </button>
          </div>
          {updateText !== null ? <p className={css.status}>{updateText}</p> : null}
        </section>
      </div>

      <p className={css.note}>{t('trayNote')}</p>
      {action.state !== 'idle' ? <p className={action.state === 'error' ? css.error : css.status}>{action.message}</p> : null}
    </div>
  )
}
