// Install the bundled plugin market into node_modules without going through
// npm's resolver, so the carefully-resolved peer tree stays intact.
//
// Why this is needed at all, and why `--legacy-peer-deps` is not the answer,
// is documented in FORK-NOTES.md. In short: every published dshmarket declares
// a peer range that no 0.1.5-rc.2 release satisfies, while --legacy-peer-deps
// would also skip the peer-declared interface packages (dsh-jobs, dsh-settings,
// dsh-attachment, dsh-session-query, dsh-session-persistence, dsh-util-time)
// that the plugin tree needs to load.
//
//   node scripts/install-dshmarket.mjs
//
// dshmarket's own dependencies (js-yaml ^4.1.0, undici ^7.29.0) are already
// satisfied by the installed tree, so nothing else has to be resolved.
import { gunzipSync } from 'node:zlib'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_MARKET_VERSION } from './prepare-dependencies.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'node_modules', 'dshmarket')
const tarball = join(root, `dshmarket-${DSH_MARKET_VERSION}.tgz`)
// .npmrc and npm_config_registry both carry a trailing slash; joining that
// verbatim yields "https://host//dshmarket/1.50.0" and the packument 404s.
const registry = (process.env.npm_config_registry ?? 'https://registry.npmmirror.com')
  .replace(/\/+$/, '')

async function download() {
  const meta = await (await fetch(`${registry}/dshmarket/${DSH_MARKET_VERSION}`, {
    signal: AbortSignal.timeout(30000),
  })).json()
  if (!meta?.dist?.tarball) throw new Error(`no tarball for dshmarket@${DSH_MARKET_VERSION} in ${registry}`)
  // The packument records registry.npmjs.org URLs even on a mirror.
  const url = meta.dist.tarball.replace('registry.npmjs.org', new URL(registry).host)
  console.log(`downloading ${url}`)
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tarball))
}

// Minimal tar reader: strip the leading "package/" component and write files.
function extract() {
  const tar = gunzipSync(readFileSync(tarball))
  let offset = 0
  let count = 0
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    const raw = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0
    const typeFlag = String.fromCharCode(header[156])
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '')
    offset += 512
    const data = tar.subarray(offset, offset + size)
    offset += Math.ceil(size / 512) * 512

    const full = prefix ? `${prefix}/${raw}` : raw
    // Only unpack the tarball's package root; anything else is not ours.
    if (!full.startsWith('package/')) continue
    const rel = full.slice('package/'.length)
    if (!rel) continue

    const target = join(dest, rel)
    if (typeFlag === '5' || full.endsWith('/')) { mkdirSync(target, { recursive: true }); continue }
    if (typeFlag !== '0' && typeFlag !== '\0') continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, data)
    count++
  }
  return count
}

if (!existsSync(tarball)) await download()
else console.log(`reusing ${tarball}`)

rmSync(dest, { recursive: true, force: true })
console.log(`extracted ${extract()} files -> ${dest}`)

for (const file of ['package.json', 'lib/index.js', 'client/client.js', 'cordis.patch.yml']) {
  if (!existsSync(join(dest, file))) throw new Error(`dshmarket is incomplete: ${file} is missing`)
}

const installed = JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8'))
if (installed.version !== DSH_MARKET_VERSION) {
  throw new Error(`expected dshmarket@${DSH_MARKET_VERSION}, unpacked ${installed.version}`)
}
console.log(`ok: dshmarket@${installed.version} in node_modules`)
