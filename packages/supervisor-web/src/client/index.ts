import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SupervisorSettingsTab, type SupervisorSettingsTabInjected } from './SupervisorSettingsTab.tsx'
import { en, zh, type SupervisorLocaleKey } from './locales.ts'

export type { SupervisorSettingsTabInjected, SupervisorSettingsTabProps } from './SupervisorSettingsTab.tsx'
export type { SupervisorLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop Supervisor installation and pairing copy. */
    'supervisor.web': SupervisorLocaleKey
  }
}

const NS = 'supervisor.web'

export const inject = ['slots', 'locale']

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return await response.json() as T
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-supervisor-web: dictionaries')
  const t = ctx.locale.bind(NS)
  const injected = (): SupervisorSettingsTabInjected => ({
    status: () => readJson('/dsh-supervisor/status'),
    download: () => readJson('/dsh-supervisor/download', { method: 'POST' }),
    openDownload: () => readJson('/dsh-supervisor/open-download', { method: 'POST' }),
    connect: () => readJson('/dsh-supervisor/connect', { method: 'POST' }),
  })
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'desktop-supervisor',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, SupervisorSettingsTab))
}
