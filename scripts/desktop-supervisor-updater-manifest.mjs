#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseArgs } from 'node:util'

function required(value, name) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} is required`)
  return value
}

function versionFromTag(tag) {
  return tag.replace(/^dsh-desktop-supervisor-/, '').replace(/^v/, '')
}

function classify(file) {
  const name = basename(file)
  const match = /^dsh-desktop-supervisor-(darwin|linux|win32)-(arm64|x64)-/.exec(name)
  if (match === null) throw new Error(`cannot classify desktop supervisor updater artifact: ${name}`)
  const platform = match[1]
  const arch = match[2] === 'arm64' ? 'aarch64' : 'x86_64'
  const installer = name.endsWith('.app.tar.gz') ? 'app'
    : name.endsWith('.AppImage') || name.endsWith('.AppImage.tar.gz') ? 'appimage'
      : name.endsWith('.deb') || name.endsWith('.deb.tar.gz') ? 'deb'
        : name.endsWith('.rpm') || name.endsWith('.rpm.tar.gz') ? 'rpm'
          : name.endsWith('.msi') || name.endsWith('.msi.zip') ? 'msi'
            : name.endsWith('.exe') || name.endsWith('.exe.zip') ? 'nsis'
              : null
  const os = platform === 'win32' ? 'windows' : platform
  return installer === null ? null : `${os}-${arch}-${installer}`
}

const { values } = parseArgs({
  options: {
    tag: { type: 'string' },
    'base-url': { type: 'string' },
    'assets-dir': { type: 'string' },
    out: { type: 'string' },
  },
})

const tag = required(values.tag, '--tag')
const baseUrl = required(values['base-url'], '--base-url').replace(/\/$/, '')
const assetsDir = required(values['assets-dir'], '--assets-dir')
const out = required(values.out, '--out')
const files = (await readdir(assetsDir)).filter(file => !file.startsWith('.')).sort()
const signatures = new Set(files.filter(file => file.endsWith('.sig')).map(file => file.slice(0, -4)))
const platforms = {}
for (const file of files) {
  if (file.endsWith('.sig') || !signatures.has(file)) continue
  const target = classify(file)
  if (target === null) continue
  platforms[target] = {
    signature: (await readFile(`${assetsDir}/${file}.sig`, 'utf8')).trim(),
    url: `${baseUrl}/${encodeURIComponent(file)}`,
  }
}
if (Object.keys(platforms).length === 0) {
  throw new Error('no signed updater artifacts found')
}
await writeFile(out, `${JSON.stringify({
  version: versionFromTag(tag),
  notes: `DSH Desktop Supervisor ${versionFromTag(tag)}`,
  pub_date: new Date().toISOString(),
  platforms,
}, null, 2)}\n`)
