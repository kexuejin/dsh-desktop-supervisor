/** Route-level coverage for the desktop supervisor Web companion. */

import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import * as SupervisorWeb from '../src/index.ts'

interface RegisteredRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

interface LoadedCompanion {
  port: number
  dispose(): Promise<void>
}

let root: string | undefined
let loaded: LoadedCompanion | undefined
let supervisor: Server | undefined
const oldDshHome = process.env.DSH_HOME

async function closeServer(server: Server | undefined): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (server === undefined) {
      resolve()
      return
    }
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
}

afterEach(async () => {
  await loaded?.dispose()
  loaded = undefined
  await closeServer(supervisor)
  supervisor = undefined
  if (oldDshHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = oldDshHome
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the companion against a minimal webServer service. */
async function loadCompanion(manifestUrl: string, localArtifactPath = ''): Promise<LoadedCompanion> {
  root = await mkdtemp(join(tmpdir(), 'dsh-supervisor-web-loader-'))
  process.env.DSH_HOME = root
  const routes: RegisteredRoute[] = []
  const disposers: Array<() => void> = []
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    const route = routes.find((candidate) => (
      candidate.kind === 'exact' ? pathname === candidate.path : pathname.startsWith(candidate.path)
    ))
    if (route === undefined) {
      response.writeHead(404)
      response.end()
      return
    }
    void route.handler(request, response)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { resolve() })
  })

  const ctx = {
    webServer: {
      register(route: RegisteredRoute) {
        routes.push(route)
        return () => {
          const index = routes.indexOf(route)
          if (index >= 0) routes.splice(index, 1)
        }
      },
    },
    effect(effect: () => (() => void) | void) {
      const disposer = effect()
      if (disposer !== undefined) disposers.push(disposer)
    },
  }
  SupervisorWeb.apply(ctx, { manifestUrl, localArtifactPath })

  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('server address missing')
  return {
    port: address.port,
    async dispose() {
      for (const disposer of disposers.splice(0).reverse()) disposer()
      await closeServer(server)
    },
  }
}

/** Fetch JSON from the composed webserver. */
async function requestJson(port: number, path: string, init?: RequestInit): Promise<{ status: number; value: unknown }> {
  const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, init)
  return { status: response.status, value: await response.json() as unknown }
}

async function writeSupervisorDescriptor(url: string): Promise<void> {
  if (root === undefined) throw new Error('test root missing')
  const supervisorRoot = join(root, 'supervisor')
  await mkdir(supervisorRoot, { recursive: true })
  const tokenPath = join(supervisorRoot, 'token')
  await writeFile(tokenPath, 'secret-token\n')
  await writeFile(join(supervisorRoot, 'control.json'), `${JSON.stringify({
    schema: 1,
    app: 'dsh-desktop-supervisor',
    version: '0.1.0-dev.1',
    pid: 123,
    url,
    tokenPath,
    capabilities: ['status', 'pair'],
  }, null, 2)}\n`)
}

async function startSupervisor(): Promise<{ url: string; authorizations: string[] }> {
  const authorizations: string[] = []
  supervisor = createServer((request, response) => {
    if (request.url === '/health' && request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
      return
    }
    if (request.url === '/pair' && request.method === 'POST') {
      authorizations.push(request.headers.authorization ?? '')
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end('{"error":"not found"}')
  })
  await new Promise<void>((resolve, reject) => {
    supervisor?.once('error', reject)
    supervisor?.listen(0, '127.0.0.1', () => { resolve() })
  })
  const address = supervisor.address()
  if (address === null || typeof address === 'string') throw new Error('server address missing')
  return { url: `http://127.0.0.1:${String(address.port)}`, authorizations }
}

describe('supervisor-web routes', () => {
  it('mounts the route prefix and reports a manifest fetch failure through HTTP', { timeout: 60_000 }, async () => {
    loaded = await loadCompanion('http://127.0.0.1:9/manifest.json')
    const port = loaded.port

    const status = await requestJson(port, '/dsh-supervisor/status')
    expect(status.status).toBe(200)
    expect(status.value).toMatchObject({
      connected: false,
      manifest: null,
      selected: null,
      download: { state: 'idle' },
      error: expect.stringContaining('127.0.0.1:9'),
    })

    const manifest = await requestJson(port, '/dsh-supervisor/manifest')
    expect(manifest.status).toBe(500)
    expect(manifest.value).toMatchObject({ error: expect.stringContaining('127.0.0.1:9') })

    const missing = await fetch(`http://127.0.0.1:${String(port)}/dsh-supervisor/nope`)
    expect(missing.status).toBe(404)

    await loaded.dispose()
    loaded = undefined
    await expect(fetch(`http://127.0.0.1:${String(port)}/dsh-supervisor/status`)).rejects.toThrow()
  })

  it('uses a configured local artifact when the remote manifest is unavailable', { timeout: 60_000 }, async () => {
    const artifactDir = await mkdtemp(join(tmpdir(), 'dsh-supervisor-local-artifact-'))
    const artifactPath = join(artifactDir, 'DSH Desktop Supervisor_0.1.0-dev.1_aarch64.dmg')
    await writeFile(artifactPath, 'local artifact bytes')
    loaded = await loadCompanion('http://127.0.0.1:9/manifest.json', artifactPath)
    const port = loaded.port

    const status = await requestJson(port, '/dsh-supervisor/status')
    expect(status.value).toMatchObject({
      manifest: { version: '0.1.0-dev.1', channel: 'local-dev' },
      selected: { url: pathToFileURL(artifactPath).toString(), kind: 'dmg' },
      error: expect.stringContaining('127.0.0.1:9'),
    })

    const download = await requestJson(port, '/dsh-supervisor/download', { method: 'POST' })
    expect(download.value).toMatchObject({ state: 'ready', path: artifactPath, verified: true })
    await rm(artifactDir, { recursive: true, force: true })
  })

  it('pairs through the control descriptor token', { timeout: 60_000 }, async () => {
    const local = await startSupervisor()
    loaded = await loadCompanion('http://127.0.0.1:9/manifest.json')
    await writeSupervisorDescriptor(local.url)
    const port = loaded.port

    const status = await requestJson(port, '/dsh-supervisor/status')
    expect(status.value).toMatchObject({ connected: true, control: { url: local.url } })

    const connect = await requestJson(port, '/dsh-supervisor/connect', { method: 'POST' })
    expect(connect).toMatchObject({ status: 200, value: { ok: true } })
    expect(local.authorizations).toEqual(['Bearer secret-token'])
  })
})
