/** Component coverage for the desktop launch Settings entry. */

import { act, create } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupervisorSettingsSection } from '../src/client/SupervisorSettingsSection.tsx'
import type { SupervisorStatusSnapshot } from '../src/types.ts'
import { en } from '../src/client/locales.ts'

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const baseSnapshot: SupervisorStatusSnapshot = {
  manifest: null,
  selected: null,
  download: {
    state: 'idle',
    version: null,
    artifact: null,
    path: null,
    sha256: null,
    verified: false,
    error: null,
  },
  control: null,
  launch: null,
  connected: false,
  error: null,
}

function textContent(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (node !== null && typeof node === 'object' && 'children' in node) {
    return textContent((node as { children?: unknown }).children ?? [])
  }
  return ''
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SupervisorSettingsSection', () => {
  it('shows core actions while desktop status refreshes in the background', async () => {
    const pendingStatus = deferred<SupervisorStatusSnapshot>()
    const setInterval = vi.fn(() => 1)
    const clearInterval = vi.fn()
    vi.stubGlobal('window', {
      setInterval,
      clearInterval,
      setTimeout: vi.fn(),
      location: { reload: vi.fn() },
    })

    let view: ReturnType<typeof create>
    await act(async () => {
      view = create(
        <SupervisorSettingsSection
          t={(key) => en[key as keyof typeof en] ?? key}
          status={() => pendingStatus.promise}
          restartDsh={() => Promise.resolve({ ok: true })}
          download={() => Promise.resolve({ ok: true })}
          openDownload={() => Promise.resolve({ ok: true })}
          connect={() => Promise.resolve({ ok: true })}
          checkUpdate={() => Promise.resolve({ ok: true, available: false })}
          installUpdate={() => Promise.resolve({ ok: true, installed: true })}
        />,
      )
    })

    const initialText = textContent(view!.toJSON())
    expect(initialText).toContain('Restart DSH')
    expect(initialText).toContain('Advanced tray tool')
    expect(initialText).toContain('Refreshing desktop launch status in the background')
    const restartButtons = view!.root.findAllByProps({ type: 'button' }).filter((button) => textContent(button.children) === 'Restart DSH')
    expect(restartButtons).toHaveLength(1)
    expect(restartButtons[0].props.disabled).toBe(false)

    await act(async () => {
      pendingStatus.resolve({ ...baseSnapshot, connected: true })
      await pendingStatus.promise
    })

    expect(textContent(view!.toJSON())).toContain('The tray tool is running')
  })
})
