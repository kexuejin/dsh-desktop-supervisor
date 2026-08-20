import { useEffect, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { SupervisorStatusSnapshot } from '../types.ts'
import css from './SupervisorSettingsSection.module.css'

export interface SupervisorSettingsSectionInjected {
  status: () => Promise<SupervisorStatusSnapshot>
  download: () => Promise<unknown>
  openDownload: () => Promise<unknown>
  connect: () => Promise<unknown>
}

export type SupervisorSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'supervisor.web'>
  & InjectFace<SupervisorSettingsSectionInjected>

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; snapshot: SupervisorStatusSnapshot }

function artifactLabel(snapshot: SupervisorStatusSnapshot): string {
  const artifact = snapshot.selected
  if (artifact === null) return '—'
  return `${artifact.platform}/${artifact.arch} ${artifact.file}`
}

function signingLabel(snapshot: SupervisorStatusSnapshot, t: SupervisorSettingsSectionProps['t']): string {
  const artifact = snapshot.selected
  if (artifact === null) return t('noArtifact')
  if (artifact.signed && artifact.notarized) return t('signed')
  return t('unsigned')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function SupervisorSettingsSection(props: SupervisorSettingsSectionProps): ReactNode {
  const { status, download, openDownload, connect, t } = props
  const [state, setState] = useState<ViewState>({ status: 'loading' })
  const [busy, setBusy] = useState(false)

  const refresh = (): void => {
    setState({ status: 'loading' })
    void status().then(
      (snapshot) => { setState({ status: 'ready', snapshot }) },
      (error) => { setState({ status: 'error', message: errorMessage(error) }) },
    )
  }

  useEffect(refresh, [status])

  const runDownload = (): void => {
    setBusy(true)
    void download().then(
      () => status(),
    ).then(
      (snapshot) => { setState({ status: 'ready', snapshot }) },
      (error) => { setState({ status: 'error', message: errorMessage(error) }) },
    ).finally(() => { setBusy(false) })
  }

  const runOpen = (): void => {
    setBusy(true)
    void openDownload().finally(() => { setBusy(false) })
  }

  const runConnect = (): void => {
    setBusy(true)
    void connect().then(
      () => status(),
    ).then(
      (snapshot) => { setState({ status: 'ready', snapshot }) },
      (error) => { setState({ status: 'error', message: errorMessage(error) }) },
    ).finally(() => { setBusy(false) })
  }

  if (state.status === 'loading') {
    return <div className={css.section}>{t('loading')}</div>
  }
  if (state.status === 'error') {
    return (
      <div className={css.section}>
        <p className={css.error}>{t('error')}: {state.message}</p>
        <button className={css.button} type="button" onClick={refresh}>{t('retry')}</button>
      </div>
    )
  }

  const snapshot = state.snapshot
  const downloadReady = snapshot.download.verified && snapshot.download.path !== null
  const isUnsigned = snapshot.selected !== null && (!snapshot.selected.signed || !snapshot.selected.notarized)

  return (
    <div className={css.section}>
      <div className={css.card}>
        <div>
          <h3>{t('title')}</h3>
          <p>{snapshot.connected ? t('connected') : t('notConnected')}</p>
        </div>
        <span className={css.badge} data-state={snapshot.connected ? 'connected' : 'missing'}>
          {snapshot.connected ? t('connectedBadge') : t('missingBadge')}
        </span>
      </div>

      <div className={css.guide}>
        <h4>{t('availableWithoutClient')}</h4>
        <p>{t('availableWithoutClientCopy')}</p>
      </div>

      <dl className={css.details}>
        <div><dt>{t('version')}</dt><dd>{snapshot.manifest?.version ?? '—'}</dd></div>
        <div><dt>{t('artifact')}</dt><dd>{artifactLabel(snapshot)}</dd></div>
        <div><dt>{t('signing')}</dt><dd>{signingLabel(snapshot, t)}</dd></div>
        <div><dt>{t('downloadState')}</dt><dd>{snapshot.download.state}</dd></div>
      </dl>

      {isUnsigned ? (
        <div className={css.guide}>
          <h4>{t('developerMode')}</h4>
          <p>{t('developerModeCopy')}</p>
          <ol>
            <li>{t('stepDownload')}</li>
            <li>{t('stepOpen')}</li>
            <li>{t('stepAllow')}</li>
            <li>{t('stepConnect')}</li>
          </ol>
        </div>
      ) : null}

      <div className={css.actions}>
        <button className={css.button} type="button" onClick={runDownload} disabled={busy || snapshot.selected === null}>
          {t('download')}
        </button>
        <button className={css.button} type="button" onClick={runOpen} disabled={busy || !downloadReady}>
          {t('openDownload')}
        </button>
        <button className={css.button} type="button" onClick={runConnect} disabled={busy || snapshot.control === null}>
          {t('connect')}
        </button>
        <button className={css.button} type="button" onClick={refresh} disabled={busy}>
          {t('refresh')}
        </button>
      </div>
    </div>
  )
}
