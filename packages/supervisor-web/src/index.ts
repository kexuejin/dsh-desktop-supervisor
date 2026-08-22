import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { request as requestHttp } from 'node:http'
import { request as requestSecure } from 'node:https'
import type { IncomingMessage, ServerResponse } from 'node:http'
import z from '@deepseek-ai/schemastery'
import type { SupervisorArtifact, SupervisorControlDescriptor, SupervisorLaunchDescriptor, SupervisorManifest, SupervisorStatusSnapshot, DownloadSnapshot } from './types.ts'

interface WebServerService {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

interface HostContext {
  webServer: WebServerService
  effect(effect: () => (() => void) | void, label?: string): void
}

const DEFAULT_MANIFEST_URL = 'https://github.com/kexuejin/dsh-desktop-supervisor/releases/latest/download/manifest.json'
const USER_AGENT = 'dsh-supervisor-web'
const MAX_REDIRECTS = 5
const ENV_KEYS = ['DSH_HOME', 'PATH', 'NODE_PATH', 'NVM_BIN', 'NVM_DIR', 'PNPM_HOME'] as const
const PROTECTED_PLUGIN_IDS = new Set([
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-market',
  '@deepseek-ai/dsh-supervisor-web',
  'dsh-base',
  'dsh-web-app',
  'dsh-market',
  'dsh-supervisor-web',
])

/** Host route configuration for the desktop supervisor Web companion. */
export interface Config {
  /** GitHub Release manifest URL used by the installer card. */
  manifestUrl?: string
  /** Optional local installer artifact used for development before public releases exist. */
  localArtifactPath?: string
}

/** Schemastery validation for {@link Config}. */
export const Config: z<Config> = z.object({
  manifestUrl: z.string().default(DEFAULT_MANIFEST_URL),
  localArtifactPath: z.string().default(''),
})

const initialDownload: DownloadSnapshot = {
  state: 'idle',
  version: null,
  artifact: null,
  path: null,
  sha256: null,
  verified: false,
  error: null,
}

let downloadSnapshot: DownloadSnapshot = initialDownload

interface TextRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}

interface InstallerSelection {
  manifest: SupervisorManifest | null
  selected: SupervisorArtifact | null
  error: string | null
}

function dshHomePath(...segments: string[]): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, ...segments)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function requestText(url: string, options: TextRequestOptions = {}, redirects = MAX_REDIRECTS): Promise<string> {
  const parsed = new URL(url)
  const client = parsed.protocol === 'https:' ? requestSecure : requestHttp
  const method = options.method ?? 'GET'
  return new Promise((resolve, reject) => {
    const request = client(parsed, {
      method,
      headers: { 'user-agent': USER_AGENT, ...options.headers },
    }, (response) => {
      const statusCode = response.statusCode ?? 0
      const location = response.headers.location
      if (statusCode >= 300 && statusCode < 400 && location !== undefined) {
        response.resume()
        if (redirects <= 0) {
          reject(new Error(`${method} ${url} redirected too many times`))
          return
        }
        resolve(requestText(new URL(location, parsed).toString(), options, redirects - 1))
        return
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`${method} ${url} failed with ${String(statusCode)}`))
        return
      }
      response.setEncoding('utf8')
      let body = ''
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => { resolve(body) })
    })
    request.on('error', reject)
    if (options.body !== undefined) request.write(options.body)
    request.end()
  })
}

function downloadFile(url: string, path: string, redirects = MAX_REDIRECTS): Promise<void> {
  const parsed = new URL(url)
  const client = parsed.protocol === 'https:' ? requestSecure : requestHttp
  return new Promise((resolve, reject) => {
    const request = client(parsed, { headers: { 'user-agent': USER_AGENT } }, (response) => {
      const statusCode = response.statusCode ?? 0
      const location = response.headers.location
      if (statusCode >= 300 && statusCode < 400 && location !== undefined) {
        response.resume()
        if (redirects <= 0) {
          reject(new Error(`GET ${url} redirected too many times`))
          return
        }
        resolve(downloadFile(new URL(location, parsed).toString(), path, redirects - 1))
        return
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`GET ${url} failed with ${String(statusCode)}`))
        return
      }
      const file = createWriteStream(path)
      response.pipe(file)
      file.on('finish', () => {
        file.close((error) => {
          if (error === null || error === undefined) resolve()
          else reject(error)
        })
      })
      file.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

function parseManifest(text: string): SupervisorManifest {
  const value = JSON.parse(text) as SupervisorManifest
  if (value.schema !== 1 || value.app !== 'dsh-desktop-supervisor' || !Array.isArray(value.artifacts)) {
    throw new Error('invalid desktop supervisor manifest')
  }
  return value
}

async function readManifest(url: string): Promise<SupervisorManifest> {
  return parseManifest(await requestText(url))
}

function artifactKind(file: string): string {
  return file.endsWith('.dmg') ? 'dmg'
    : file.endsWith('.app.tar.gz') ? 'app-tar-gz'
      : file.endsWith('.AppImage') ? 'appimage'
        : file.endsWith('.deb') ? 'deb'
          : file.endsWith('.rpm') ? 'rpm'
            : file.endsWith('.msi') ? 'msi'
              : file.endsWith('.exe') ? 'exe'
                : 'archive'
}

function localVersion(file: string): string {
  const match = /_(.+?)_(?:aarch64|x64|x86_64|arm64)\./u.exec(file)
  return match?.[1] ?? 'local-dev'
}

async function localManifest(path: string | undefined): Promise<SupervisorManifest | null> {
  if (path === undefined || path.length === 0) return null
  await stat(path)
  const file = basename(path)
  const sha = await sha256(path)
  return {
    schema: 1,
    app: 'dsh-desktop-supervisor',
    version: localVersion(file),
    channel: 'local-dev',
    artifacts: [{
      platform: process.platform,
      arch: process.arch,
      kind: artifactKind(file),
      file,
      url: pathToFileURL(path).toString(),
      sha256: sha,
      signed: false,
      notarized: false,
      installMode: process.platform === 'darwin' ? 'macos-developer-open' : 'manual-open',
    }],
  }
}

function selectArtifact(manifest: SupervisorManifest): SupervisorArtifact | null {
  return manifest.artifacts.find((artifact) => artifact.platform === process.platform && artifact.arch === process.arch) ?? null
}

async function installerSelection(config: Required<Config>): Promise<InstallerSelection> {
  try {
    const manifest = await readManifest(config.manifestUrl)
    return { manifest, selected: selectArtifact(manifest), error: null }
  } catch (error) {
    const message = errorMessage(error)
    const fallback = await localManifest(config.localArtifactPath)
    return { manifest: fallback, selected: fallback === null ? null : selectArtifact(fallback), error: message }
  }
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  const file = await import('node:fs').then(({ createReadStream }) => createReadStream(path))
  return await new Promise((resolve, reject) => {
    file.on('data', (chunk) => { hash.update(chunk) })
    file.on('end', () => { resolve(hash.digest('hex')) })
    file.on('error', reject)
  })
}

async function downloadSelected(config: Required<Config>): Promise<DownloadSnapshot> {
  downloadSnapshot = { ...initialDownload, state: 'fetchingManifest' }
  const { manifest, selected, error } = await installerSelection(config)
  if (manifest === null) throw new Error(error ?? 'no desktop supervisor manifest is available')
  const artifact = selected
  if (artifact === null) throw new Error(`no desktop supervisor artifact for ${process.platform}/${process.arch}`)
  const source = new URL(artifact.url)
  if (source.protocol === 'file:') {
    const path = fileURLToPath(source)
    downloadSnapshot = { state: 'verifying', version: manifest.version, artifact: artifact.file, path, sha256: artifact.sha256, verified: false, error: null }
    const actual = await sha256(path)
    if (actual !== artifact.sha256) throw new Error(`SHA-256 mismatch for ${artifact.file}`)
    downloadSnapshot = { ...downloadSnapshot, state: 'ready', verified: true }
    return downloadSnapshot
  }
  const directory = dshHomePath('downloads', 'desktop-supervisor', manifest.version)
  const path = join(directory, artifact.file)
  await mkdir(directory, { recursive: true })
  downloadSnapshot = { state: 'downloading', version: manifest.version, artifact: artifact.file, path, sha256: artifact.sha256, verified: false, error: null }
  await downloadFile(artifact.url, path)
  downloadSnapshot = { ...downloadSnapshot, state: 'verifying' }
  const actual = await sha256(path)
  if (actual !== artifact.sha256) throw new Error(`SHA-256 mismatch for ${artifact.file}`)
  downloadSnapshot = { ...downloadSnapshot, state: 'ready', verified: true }
  return downloadSnapshot
}

function selectedProfile(args: readonly string[]): string {
  if (args[0] === 'web') return 'web'
  const index = args.indexOf('--profile')
  const profile = index >= 0 ? args[index + 1] : undefined
  return profile === undefined || profile === '' ? 'web' : profile
}

function launcherPatches(args: readonly string[]): string[] {
  const patches: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const next = args[index + 1]
    if (args[index] === '--patch' && next !== undefined) patches.push(next)
  }
  return patches
}

function appArgs(args: readonly string[]): string[] {
  const profile = selectedProfile(args)
  if (args[0] === 'web') return args.slice(1).filter((arg, index, rest) => arg !== '--patch' && rest[index - 1] !== '--patch')
  const profileIndex = args.indexOf('--profile')
  const firstAppArg = profileIndex >= 0 ? profileIndex + 2 : 0
  return profile === 'web' ? args.slice(firstAppArg).filter((arg, index, rest) => arg !== '--patch' && rest[index - 1] !== '--patch') : args.slice(firstAppArg)
}

function captureEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const key of ENV_KEYS) {
    const value = process.env[key]
    if (value !== undefined && value !== '') env[key] = value
  }
  return env
}

function captureLaunchDescriptor(): SupervisorLaunchDescriptor {
  const entry = process.argv[1] ?? ''
  const innerArgs = process.argv.slice(2)
  return {
    schema: 1,
    app: 'dsh',
    capturedAt: new Date().toISOString(),
    pid: process.pid,
    execPath: process.execPath,
    execArgv: [...process.execArgv],
    entry,
    innerArgs,
    args: [...process.execArgv, entry, ...innerArgs].filter((arg) => arg !== ''),
    cwd: process.cwd(),
    env: captureEnv(),
    profile: selectedProfile(innerArgs),
    patches: launcherPatches(innerArgs),
    appArgs: appArgs(innerArgs),
    webUrl: 'http://127.0.0.1:3080',
  }
}

function writeLaunchDescriptor(): void {
  const launch = captureLaunchDescriptor()
  const supervisorRoot = dshHomePath('supervisor')
  mkdirSync(supervisorRoot, { recursive: true })
  writeFileSync(join(supervisorRoot, 'launch.json'), `${JSON.stringify(launch, null, 2)}\n`)
}

async function readLaunchDescriptor(): Promise<SupervisorLaunchDescriptor | null> {
  try {
    const text = await readFile(dshHomePath('supervisor', 'launch.json'), 'utf8')
    const value = JSON.parse(text) as SupervisorLaunchDescriptor
    if (value.schema !== 1 || value.app !== 'dsh') return null
    return value
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function readControl(): Promise<SupervisorControlDescriptor | null> {
  try {
    const text = await readFile(dshHomePath('supervisor', 'control.json'), 'utf8')
    const value = JSON.parse(text) as SupervisorControlDescriptor
    if (value.schema !== 1 || value.app !== 'dsh-desktop-supervisor') return null
    return value
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

async function readToken(control: SupervisorControlDescriptor): Promise<string> {
  return (await readFile(control.tokenPath, 'utf8')).trim()
}

async function supervisorHealth(control: SupervisorControlDescriptor): Promise<boolean> {
  try {
    await requestText(new URL('/health', control.url).toString())
    return true
  } catch {
    return false
  }
}

async function statusSnapshot(config: Required<Config>): Promise<SupervisorStatusSnapshot> {
  const control = await readControl()
  const launch = await readLaunchDescriptor()
  const { manifest, selected, error } = await installerSelection(config)
  return {
    manifest,
    selected,
    download: downloadSnapshot,
    control,
    launch,
    connected: control === null ? false : await supervisorHealth(control),
    error,
  }
}

async function callSupervisor(control: SupervisorControlDescriptor, path: string, body?: string): Promise<unknown> {
  const token = await readToken(control)
  const url = new URL(path, control.url).toString()
  const headers: Record<string, string> = { authorization: `Bearer ${token}` }
  if (body !== undefined) {
    headers['content-type'] = 'application/json'
    headers['content-length'] = String(Buffer.byteLength(body))
  }
  const options: TextRequestOptions = { method: 'POST', headers }
  if (body !== undefined) options.body = body
  return JSON.parse(await requestText(url, options)) as unknown
}

async function connectSupervisor(control: SupervisorControlDescriptor): Promise<unknown> {
  return await callSupervisor(control, '/pair')
}

async function restartViaSupervisor(): Promise<unknown> {
  const control = await readControl()
  if (control === null) return JSON.parse(await requestText('http://127.0.0.1:3080/dsh-market/restart', { method: 'POST', headers: { origin: 'http://127.0.0.1:3080' } })) as unknown
  return await callSupervisor(control, '/restart')
}

function pluginCandidatesFromText(text: string): string[] {
  const candidates = new Set<string>()
  const patterns = [
    /(?:plugin|bundle|row|id)\s+["'`]([^"'`\s]+)["'`]/gi,
    /(?:cannot resolve profile bundle|profile bundle)\s+["'`]([^"'`\s]+)["'`]/gi,
    /@deepseek-ai\/dsh-[\w-]+|@[\w-]+\/[\w-]+|dsh-[\w-]+/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = (match[1] ?? match[0]).trim()
      if ((value.length > 0 && !value.includes('/')) || value.startsWith('@') || value.startsWith('dsh-')) candidates.add(value)
    }
  }
  return [...candidates].filter((candidate) => !PROTECTED_PLUGIN_IDS.has(candidate))
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

async function disablePluginViaSupervisor(pluginId: string, reason: string | undefined): Promise<unknown> {
  const control = await readControl()
  if (control === null) throw new Error('no supervisor control descriptor is available')
  return await callSupervisor(control, '/disable-plugin', JSON.stringify({ pluginId, reason }))
}

function parseJsonBody(text: string): Record<string, unknown> {
  const value = JSON.parse(text) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('request body must be a JSON object')
  return value as Record<string, unknown>
}

function openPath(path: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  import('node:child_process').then(({ spawn }) => {
    const child = spawn(command, [path], { detached: true, stdio: 'ignore' })
    child.unref()
  }).catch(() => {})
}

async function route(request: IncomingMessage, response: ServerResponse, config: Required<Config>): Promise<void> {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  try {
    if (pathname === '/dsh-supervisor/status' && request.method === 'GET') {
      sendJson(response, 200, await statusSnapshot(config))
      return
    }
    if (pathname === '/dsh-supervisor/manifest' && request.method === 'GET') {
      const { manifest, error } = await installerSelection(config)
      if (manifest === null) {
        sendJson(response, 500, { error })
        return
      }
      sendJson(response, 200, manifest)
      return
    }
    if (pathname === '/dsh-supervisor/download' && request.method === 'POST') {
      try {
        sendJson(response, 200, await downloadSelected(config))
      } catch (error) {
        downloadSnapshot = { ...downloadSnapshot, state: 'failed', error: errorMessage(error) }
        sendJson(response, 500, { error: downloadSnapshot.error })
      }
      return
    }
    if (pathname === '/dsh-supervisor/open-download' && request.method === 'POST') {
      if (downloadSnapshot.path === null || !downloadSnapshot.verified) {
        sendJson(response, 409, { error: 'no verified supervisor download is ready' })
        return
      }
      await stat(downloadSnapshot.path)
      openPath(downloadSnapshot.path)
      sendJson(response, 200, { ok: true })
      return
    }
    if (pathname === '/dsh-supervisor/connect' && request.method === 'POST') {
      const control = await readControl()
      if (control === null) {
        sendJson(response, 409, { error: 'no supervisor control descriptor is available' })
        return
      }
      sendJson(response, 200, await connectSupervisor(control))
      return
    }
    if (pathname === '/dsh-supervisor/restart' && request.method === 'POST') {
      sendJson(response, 200, await restartViaSupervisor())
      return
    }
    if (pathname === '/dsh-supervisor/diagnose' && request.method === 'POST') {
      const body = parseJsonBody(await readRequestBody(request))
      const text = typeof body.text === 'string' ? body.text : ''
      sendJson(response, 200, { candidates: pluginCandidatesFromText(text) })
      return
    }
    if (pathname === '/dsh-supervisor/disable-plugin' && request.method === 'POST') {
      const body = parseJsonBody(await readRequestBody(request))
      const pluginId = typeof body.pluginId === 'string' ? body.pluginId : ''
      if (pluginId.length === 0) {
        sendJson(response, 400, { error: 'pluginId is required' })
        return
      }
      const reason = typeof body.reason === 'string' ? body.reason : undefined
      sendJson(response, 200, await disablePluginViaSupervisor(pluginId, reason))
      return
    }
    response.writeHead(404)
    response.end()
  } catch (error) {
    sendJson(response, 500, { error: errorMessage(error) })
  }
}

export const name = 'dsh-supervisor-web'
export const inject = ['webServer']

export function apply(ctx: HostContext, config: Config = {}): void {
  const resolved = {
    manifestUrl: config.manifestUrl ?? DEFAULT_MANIFEST_URL,
    localArtifactPath: config.localArtifactPath ?? '',
  }
  writeLaunchDescriptor()
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-supervisor',
    handler: (request, response) => route(request, response, resolved),
  }), 'dsh-supervisor-web: routes')
}
