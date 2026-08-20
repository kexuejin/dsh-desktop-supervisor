import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { SupervisorSettingsSection, type SupervisorSettingsSectionInjected } from './SupervisorSettingsSection.tsx'
import { en, zh, type SupervisorLocaleKey } from './locales.ts'

export type { SupervisorSettingsSectionInjected, SupervisorSettingsSectionProps } from './SupervisorSettingsSection.tsx'
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
  const injected = (): SupervisorSettingsSectionInjected => ({
    status: () => readJson('/dsh-supervisor/status'),
    download: () => readJson('/dsh-supervisor/download', { method: 'POST' }),
    openDownload: () => readJson('/dsh-supervisor/open-download', { method: 'POST' }),
    connect: () => readJson('/dsh-supervisor/connect', { method: 'POST' }),
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'desktop-supervisor',
    order: 12,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, SupervisorSettingsSection))
}
