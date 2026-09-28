import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Upstream 0.1.2+ gates the Web GUI behind a per-process launch token that is
// appended to the announced URL as `/?token=...`; the older `\b`-terminated
// pattern cut that query off and the shell then loaded an unauthenticated URL
// and rendered upstream's 401 page. Keep the loopback-only anchor (a LAN URL
// must still be rejected) but capture the optional token query verbatim.
const READY_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/\?\S+)?)/m

export function resolveDshEntry() {
  return unpackedPath(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js')))
}

export function unpackedPath(path) {
  return path.replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2')
}

export function extractReadyUrl(output) {
  return READY_PATTERN.exec(output)?.[1]
}

export function resolvePluginMarketPatch() {
  return fileURLToPath(new URL('../config/plugin-market.patch.yml', import.meta.url))
}

export function resolveBundledToolDirectory() {
  return fileURLToPath(new URL('../assets/bin', import.meta.url))
}

export function resolveBundledPnpmEntry() {
  return unpackedPath(fileURLToPath(new URL('../node_modules/pnpm/bin/pnpm.cjs', import.meta.url)))
}

export function resolveWindowsPickerPatch() {
  return fileURLToPath(new URL('../config/windows-directory-picker.patch.yml', import.meta.url))
}

export function resolveWindowsHiddenConsoleLauncher() {
  return fileURLToPath(new URL('../assets/windows-hidden-console.exe', import.meta.url))
}

export function resolveWindowsNodeExecutable() {
  return fileURLToPath(new URL('../assets/dsh-node.exe', import.meta.url))
}

export function buildDshArgs(entry, {
  platform = process.platform,
  pluginMarketPatch = resolvePluginMarketPatch(),
  windowsPickerPatch = resolveWindowsPickerPatch(),
} = {}) {
  return [
    '--expose-internals',
    entry,
    '--profile',
    'web',
    '--patch',
    pluginMarketPatch,
    ...(platform === 'win32' ? ['--patch', windowsPickerPatch] : []),
    '--host',
    '127.0.0.1',
    '--port',
    '0',
    '--no-open',
  ]
}

export function buildDshCommand({
  electronExecutable,
  entry = resolveDshEntry(),
  platform = process.platform,
  windowsLauncher = resolveWindowsHiddenConsoleLauncher(),
  windowsNodeExecutable = resolveWindowsNodeExecutable(),
} = {}) {
  if (!electronExecutable) {
    throw new Error('electronExecutable is required')
  }

  const args = buildDshArgs(entry, { platform })
  return platform === 'win32'
    ? { command: windowsLauncher, args: [windowsNodeExecutable, ...args] }
    : { command: electronExecutable, args }
}

// Windows resolves a bare `powershell.exe` through PATH, and some installations
// carry no system directories on PATH at all. Any plugin that spawns one then
// dies with ENOENT: `dsh-host-open-in-app` does exactly that, which surfaces as
// "path open failed: spawn powershell.exe ENOENT" when a path is clicked in the
// GUI. `dsh-pwsh-local` survives the same environment because it falls back to
// an absolute path. These are appended, never prepended, so a tool the user put
// on PATH still wins.
export function windowsSystemPathEntries(environment) {
  const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT ?? environment.systemroot
  if (!systemRoot) return []
  return [
    path.join(systemRoot, 'System32'),
    systemRoot,
    path.join(systemRoot, 'System32', 'Wbem'),
    path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
  ]
}

export function buildDshEnvironment(environment, {
  platform = process.platform,
  nodeExecutable,
  bundledToolDirectory = resolveBundledToolDirectory(),
  bundledPnpmEntry = resolveBundledPnpmEntry(),
} = {}) {
  const pathKey = platform === 'win32'
    ? Object.keys(environment).find((key) => key.toLowerCase() === 'path') ?? 'Path'
    : 'PATH'
  const separator = platform === 'win32' ? ';' : ':'
  const inherited = environment[pathKey]

  const entries = [bundledToolDirectory, inherited].filter(Boolean)
  if (platform === 'win32') {
    const present = new Set(
      (inherited ?? '').split(separator).map((entry) => entry.trim().toLowerCase()).filter(Boolean),
    )
    for (const entry of windowsSystemPathEntries(environment)) {
      if (!present.has(entry.toLowerCase())) entries.push(entry)
    }
  }

  return {
    ...environment,
    [pathKey]: entries.join(separator),
    DSH_DESKTOP_NODE_EXECUTABLE: nodeExecutable,
    DSH_DESKTOP_PNPM_CLI: bundledPnpmEntry,
    ...(platform === 'win32' ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
  }
}

// A first launch has to build the profile - 483 junctions into the bundled
// node_modules - before the kernel even starts loading its plugin tree, and the
// kernel prints nothing at all until it is ready. Measured cold start on a warm
// developer machine is about 17s; a slow disk, or an antivirus scanning every
// file in the installation, multiplies that. The 60s this shell used to allow
// turned a merely slow first start into "could not start", with an empty dialog
// and nothing on disk to look at. Time out generously instead, and leave a log.
export const DEFAULT_READY_TIMEOUT_MS = 300_000

// The dialog is not a terminal. A plugin-tree dump would push the useful part
// out of view, so keep the tail; and say plainly when there was nothing at all,
// because silence means "still initialising", not "crashed".
export function describeKernelOutput(output) {
  const trimmed = output.trim()
  if (!trimmed) return '（内核在超时前没有输出任何内容——它还在初始化，不是崩溃）'
  return trimmed.length > 2000 ? `…（前文省略）\n${trimmed.slice(-2000)}` : trimmed
}

// Tee every byte the kernel prints into a file, so a failed launch leaves
// evidence behind instead of only a dialog the user has already dismissed.
function openKernelLog(logPath, command, args) {
  const noop = { write: () => {}, close: () => {} }
  if (!logPath) return noop

  let stream
  try {
    stream = createWriteStream(logPath, { flags: 'w' })
    stream.on('error', () => {
      stream = undefined
    })
    stream.write(`# ${new Date().toISOString()}\n# ${command} ${args.join(' ')}\n`)
  } catch {
    return noop
  }

  return {
    write: (text) => {
      try {
        stream?.write(text)
      } catch {
        // A log that cannot be written must never take the launch down with it.
      }
    },
    close: () => {
      try {
        stream?.end()
      } catch {
        // Same.
      }
    },
  }
}

export function startDshService({
  electronExecutable,
  entry = resolveDshEntry(),
  environment = process.env,
  platform = process.platform,
  timeoutMs = DEFAULT_READY_TIMEOUT_MS,
  logPath,
  windowsLauncher = resolveWindowsHiddenConsoleLauncher(),
  windowsNodeExecutable = resolveWindowsNodeExecutable(),
} = {}) {
  const { command, args } = buildDshCommand({
    electronExecutable,
    entry,
    platform,
    windowsLauncher,
    windowsNodeExecutable,
  })

  const child = spawn(command, args, {
    env: buildDshEnvironment(environment, {
      platform,
      nodeExecutable: platform === 'win32' ? windowsNodeExecutable : electronExecutable,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const log = openKernelLog(logPath, command, args)
  const logSuffix = logPath ? `\n\n完整日志：${logPath}` : ''

  let output = ''
  let settled = false

  const ready = new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback(value)
    }

    const inspect = (chunk) => {
      const text = chunk.toString()
      output += text
      log.write(text)
      const url = extractReadyUrl(output)
      if (url) finish(resolve, url)
    }

    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', (error) => {
      log.write(`\n启动失败：${error.message}\n`)
      finish(reject, error)
    })
    child.once('exit', (code, signal) => {
      log.write(`\n内核退出 code=${String(code)} signal=${String(signal)}\n`)
      finish(
        reject,
        new Error(
          `DeepSeek Harness stopped before it was ready (code ${String(code)}, signal ${String(signal)}).\n${describeKernelOutput(output)}${logSuffix}`,
        ),
      )
    })

    const timeout = setTimeout(() => {
      log.write(`\n等待 ${timeoutMs}ms 仍未就绪，终止内核\n`)
      child.kill('SIGTERM')
      finish(
        reject,
        new Error(
          `DeepSeek Harness did not become ready within ${timeoutMs}ms.\n${describeKernelOutput(output)}${logSuffix}`,
        ),
      )
    }, timeoutMs)
  })

  const stop = () => {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGTERM')
    }
    log.close()
  }

  return { child, ready, stop, logPath }
}

export function dshEntryUrl() {
  return pathToFileURL(resolveDshEntry()).href
}
