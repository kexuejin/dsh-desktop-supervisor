#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

function required(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} is required`)
  return value
}

function classify(file) {
  const name = basename(file)
  const match = /^dsh-desktop-supervisor-(darwin|linux|win32)-(arm64|x64)-/.exec(name)
  if (match === null) throw new Error(`cannot classify desktop supervisor artifact: ${name}`)
  const platform = match[1]
  const arch = match[2]
  const kind = name.endsWith('.dmg') ? 'dmg'
    : name.endsWith('.app.tar.gz') ? 'app-tar-gz'
      : name.endsWith('.AppImage') || name.endsWith('.AppImage.tar.gz') ? 'appimage'
        : name.endsWith('.deb') || name.endsWith('.deb.tar.gz') ? 'deb'
          : name.endsWith('.rpm') || name.endsWith('.rpm.tar.gz') ? 'rpm'
            : name.endsWith('.msi') || name.endsWith('.msi.zip') ? 'msi'
              : name.endsWith('.exe') || name.endsWith('.exe.zip') ? 'exe'
                : 'archive'
  return { platform, arch, kind }
}

function checksumMap(text) {
  const checksums = new Map()
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line)
    if (match === null) throw new Error(`invalid checksum line: ${line}`)
    checksums.set(match[2], match[1].toLowerCase())
  }
  return checksums
}

const { values } = parseArgs({
  options: {
    tag: { type: 'string' },
    'base-url': { type: 'string' },
    'assets-dir': { type: 'string' },
    checksums: { type: 'string' },
    out: { type: 'string' },
  },
})

const tag = required(values.tag, '--tag')
const baseUrl = required(values['base-url'], '--base-url').replace(/\/$/, '')
const assetsDir = required(values['assets-dir'], '--assets-dir')
const checksumsPath = required(values.checksums, '--checksums')
const out = required(values.out, '--out')
const checksums = checksumMap(await readFile(checksumsPath, 'utf8'))
const files = (await readdir(assetsDir)).filter(file => !file.startsWith('.') && !file.endsWith('.sig')).sort()
const artifacts = files.map((file) => {
  const classified = classify(file)
  const sha256 = checksums.get(file)
  if (sha256 === undefined) throw new Error(`missing checksum for ${file}`)
  return {
    ...classified,
    file,
    url: `${baseUrl}/${encodeURIComponent(file)}`,
    sha256,
    signed: false,
    notarized: false,
    installMode: classified.platform === 'darwin' ? 'macos-developer-open' : 'manual-open',
  }
})

await writeFile(out, `${JSON.stringify({
  schema: 1,
  app: 'dsh-desktop-supervisor',
  version: tag.replace(/^dsh-desktop-supervisor-/, '').replace(/^v/, ''),
  channel: 'developer',
  artifacts,
}, null, 2)}\n`)
