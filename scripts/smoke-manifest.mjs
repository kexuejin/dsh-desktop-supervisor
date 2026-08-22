import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp } from 'node:fs/promises'

const root = await mkdtemp(join(tmpdir(), 'dsh-desktop-supervisor-manifest-'))
const assets = join(root, 'assets')
const release = join(root, 'release')
await mkdir(assets, { recursive: true })
await mkdir(release, { recursive: true })
await writeFile(join(assets, 'dsh-desktop-supervisor-darwin-arm64-test.dmg'), 'darwin')
await writeFile(join(assets, 'dsh-desktop-supervisor-win32-x64-test.msi'), 'win')

const { execFile } = await import('node:child_process')
const { promisify } = await import('node:util')
const run = promisify(execFile)
await run('sh', ['-c', `cd ${JSON.stringify(assets)} && shasum -a 256 * > ${JSON.stringify(join(release, 'SHA256SUMS'))}`])
const out = join(release, 'manifest.json')
await run('node', [
  'scripts/desktop-supervisor-manifest.mjs',
  '--tag', 'v0.1.0-dev.2',
  '--base-url', 'https://example.invalid/releases/download/v0.1.0-dev.2',
  '--assets-dir', assets,
  '--checksums', join(release, 'SHA256SUMS'),
  '--out', out,
])
const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(out, 'utf8'))
if (manifest.schema !== 1 || manifest.app !== 'dsh-desktop-supervisor' || manifest.artifacts.length !== 2) {
  throw new Error('manifest smoke failed')
}
console.log(JSON.stringify({ version: manifest.version, artifacts: manifest.artifacts.map((artifact) => artifact.kind).sort() }))
