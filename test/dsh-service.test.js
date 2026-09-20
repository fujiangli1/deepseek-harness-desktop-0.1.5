import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import {
  buildDshEnvironment,
  buildDshCommand,
  buildDshArgs,
  extractReadyUrl,
  resolveDshEntry,
  resolvePluginMarketPatch,
  resolveBundledPnpmEntry,
  resolveBundledToolDirectory,
  resolveWindowsHiddenConsoleLauncher,
  resolveWindowsNodeExecutable,
  resolveWindowsPickerPatch,
  unpackedPath,
  windowsSystemPathEntries,
} from '../src/dsh-service.js'

test('extractReadyUrl reads the canonical loopback readiness URL', () => {
  assert.equal(
    extractReadyUrl('booting\ndsh web: http://127.0.0.1:60882\n'),
    'http://127.0.0.1:60882',
  )
})

test('extractReadyUrl ignores non-loopback output', () => {
  assert.equal(extractReadyUrl('dsh web: http://192.168.1.10:3080'), undefined)
})

test('extractReadyUrl keeps the launch token upstream 0.1.2+ appends', () => {
  assert.equal(
    extractReadyUrl('dsh web: http://127.0.0.1:4405/?token=9f3c1a7be2d84c05a6b1'),
    'http://127.0.0.1:4405/?token=9f3c1a7be2d84c05a6b1',
  )
})

test('extractReadyUrl stops before the LAN suffix', () => {
  assert.equal(
    extractReadyUrl('dsh web: http://127.0.0.1:4405/?token=abc (LAN: http://192.168.1.7:4405/?token=abc)'),
    'http://127.0.0.1:4405/?token=abc',
  )
})

test('extractReadyUrl still accepts a token-less loopback URL', () => {
  assert.equal(extractReadyUrl('dsh web: http://127.0.0.1:3080'), 'http://127.0.0.1:3080')
})

test('resolveDshEntry finds the pinned CLI package', () => {
  assert.equal(
    resolveDshEntry().endsWith(path.join('@deepseek-ai', 'dsh', 'lib', 'bin.js')),
    true,
  )
})

test('unpackedPath maps packaged dependencies to Electron unpacked resources', () => {
  assert.equal(
    unpackedPath('/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar.unpacked/node_modules/@deepseek-ai/dsh/lib/bin.js',
  )
  assert.equal(unpackedPath('/workspace/node_modules/@deepseek-ai/dsh/lib/bin.js'), '/workspace/node_modules/@deepseek-ai/dsh/lib/bin.js')
})

test('buildDshArgs includes the runtime flag required by upstream HMR and disables browser handoff', () => {
  assert.deepEqual(buildDshArgs('/app/dsh.js', {
    platform: 'darwin',
    pluginMarketPatch: '/app/plugin-market.yml',
  }), [
    '--expose-internals',
    '/app/dsh.js',
    '--profile',
    'web',
    '--patch',
    '/app/plugin-market.yml',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
    '--no-open',
  ])
})

test('buildDshArgs pins the browse directory picker on Windows', () => {
  assert.deepEqual(buildDshArgs('C:\\app\\dsh.js', {
    platform: 'win32',
    pluginMarketPatch: 'C:\\app\\plugin-market.yml',
    windowsPickerPatch: 'C:\\app\\windows-picker.yml',
  }), [
    '--expose-internals',
    'C:\\app\\dsh.js',
    '--profile',
    'web',
    '--patch',
    'C:\\app\\plugin-market.yml',
    '--patch',
    'C:\\app\\windows-picker.yml',
    '--host',
    '127.0.0.1',
    '--port',
    '0',
    '--no-open',
  ])
  assert.equal(resolvePluginMarketPatch().endsWith('plugin-market.patch.yml'), true)
  assert.equal(resolveWindowsPickerPatch().endsWith('windows-directory-picker.patch.yml'), true)
})

test('buildDshCommand uses the hidden-console launcher on Windows', () => {
  assert.deepEqual(buildDshCommand({
    electronExecutable: 'C:\\app\\DeepSeek Harness.exe',
    entry: 'C:\\app\\dsh.js',
    platform: 'win32',
    windowsLauncher: 'C:\\app\\windows-hidden-console.exe',
    windowsNodeExecutable: 'C:\\app\\dsh-node.exe',
  }), {
    command: 'C:\\app\\windows-hidden-console.exe',
    args: [
      'C:\\app\\dsh-node.exe',
      '--expose-internals',
      'C:\\app\\dsh.js',
      '--profile',
      'web',
      '--patch',
      resolvePluginMarketPatch(),
      '--patch',
      resolveWindowsPickerPatch(),
      '--host',
      '127.0.0.1',
      '--port',
      '0',
      '--no-open',
    ],
  })
})

test('buildDshCommand starts Electron directly on other platforms', () => {
  assert.deepEqual(buildDshCommand({
    electronExecutable: '/app/electron',
    entry: '/app/dsh.js',
    platform: 'linux',
  }), {
    command: '/app/electron',
    args: [
      '--expose-internals',
      '/app/dsh.js',
      '--profile',
      'web',
      '--patch',
      resolvePluginMarketPatch(),
      '--host',
      '127.0.0.1',
      '--port',
      '0',
      '--no-open',
    ],
  })
})

test('buildDshEnvironment exposes the bundled pnpm wrapper on macOS and Linux', () => {
  assert.deepEqual(buildDshEnvironment({
    PATH: '/usr/bin',
    NODE_OPTIONS: '--trace-warnings',
  }, {
    platform: 'darwin',
    nodeExecutable: '/app/DeepSeek Harness',
    bundledToolDirectory: '/app/assets/bin',
    bundledPnpmEntry: '/app/node_modules/pnpm/bin/pnpm.cjs',
  }), {
    PATH: '/app/assets/bin:/usr/bin',
    NODE_OPTIONS: '--trace-warnings',
    DSH_DESKTOP_NODE_EXECUTABLE: '/app/DeepSeek Harness',
    DSH_DESKTOP_PNPM_CLI: '/app/node_modules/pnpm/bin/pnpm.cjs',
    ELECTRON_RUN_AS_NODE: '1',
  })
})

test('buildDshEnvironment exposes the bundled pnpm wrapper on Windows', () => {
  assert.deepEqual(buildDshEnvironment({
    Path: 'C:\\Windows\\System32',
  }, {
    platform: 'win32',
    nodeExecutable: 'C:\\app\\dsh-node.exe',
    bundledToolDirectory: 'C:\\app\\assets\\bin',
    bundledPnpmEntry: 'C:\\app\\node_modules\\pnpm\\bin\\pnpm.cjs',
  }), {
    Path: 'C:\\app\\assets\\bin;C:\\Windows\\System32',
    DSH_DESKTOP_NODE_EXECUTABLE: 'C:\\app\\dsh-node.exe',
    DSH_DESKTOP_PNPM_CLI: 'C:\\app\\node_modules\\pnpm\\bin\\pnpm.cjs',
  })
})

test('buildDshEnvironment appends the Windows system directories a bare PATH lacks', () => {
  // Regression: with no system directories on PATH, dsh-host-open-in-app spawns
  // a bare `powershell.exe` and dies with ENOENT.
  const result = buildDshEnvironment({
    Path: 'C:\\tools',
    SystemRoot: 'C:\\Windows',
  }, {
    platform: 'win32',
    nodeExecutable: 'C:\\app\\dsh-node.exe',
    bundledToolDirectory: 'C:\\app\\assets\\bin',
    bundledPnpmEntry: 'C:\\app\\node_modules\\pnpm\\bin\\pnpm.cjs',
  })
  assert.equal(result.Path, [
    'C:\\app\\assets\\bin',
    'C:\\tools',
    'C:\\Windows\\System32',
    'C:\\Windows',
    'C:\\Windows\\System32\\Wbem',
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
  ].join(';'))
})

test('buildDshEnvironment does not repeat Windows system directories already present', () => {
  const result = buildDshEnvironment({
    Path: 'C:\\Windows\\System32;C:\\Windows\\System32\\WindowsPowerShell\\v1.0',
    SystemRoot: 'C:\\Windows',
  }, {
    platform: 'win32',
    nodeExecutable: 'C:\\app\\dsh-node.exe',
    bundledToolDirectory: 'C:\\app\\assets\\bin',
    bundledPnpmEntry: 'C:\\app\\node_modules\\pnpm\\bin\\pnpm.cjs',
  })
  assert.equal(result.Path.split(';').filter((entry) => entry === 'C:\\Windows\\System32').length, 1)
  assert.equal(
    result.Path.split(';').filter((entry) => entry === 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0').length,
    1,
  )
  assert.equal(result.Path.endsWith('C:\\Windows\\System32\\Wbem'), true)
})

test('buildDshEnvironment leaves PATH alone when the system root is unknown', () => {
  const result = buildDshEnvironment({ Path: 'C:\\tools' }, {
    platform: 'win32',
    nodeExecutable: 'C:\\app\\dsh-node.exe',
    bundledToolDirectory: 'C:\\app\\assets\\bin',
    bundledPnpmEntry: 'C:\\app\\node_modules\\pnpm\\bin\\pnpm.cjs',
  })
  assert.equal(result.Path, 'C:\\app\\assets\\bin;C:\\tools')
  assert.deepEqual(windowsSystemPathEntries({}), [])
})

test('buildDshEnvironment does not touch PATH on non-Windows platforms', () => {
  const result = buildDshEnvironment({ PATH: '/usr/bin', SystemRoot: 'C:\\Windows' }, {
    platform: 'linux',
    nodeExecutable: '/app/electron',
    bundledToolDirectory: '/app/assets/bin',
    bundledPnpmEntry: '/app/node_modules/pnpm/bin/pnpm.cjs',
  })
  assert.equal(result.PATH, '/app/assets/bin:/usr/bin')
})

test('bundled pnpm paths point to packaged runtime assets', () => {
  assert.equal(resolveBundledToolDirectory().endsWith(path.join('assets', 'bin')), true)
  assert.equal(resolveBundledPnpmEntry().endsWith(path.join('node_modules', 'pnpm', 'bin', 'pnpm.cjs')), true)
})

test('resolveWindowsHiddenConsoleLauncher points to the packaged launcher', () => {
  assert.equal(
    resolveWindowsHiddenConsoleLauncher().endsWith(path.join('assets', 'windows-hidden-console.exe')),
    true,
  )
})

test('resolveWindowsNodeExecutable points to the packaged console-subsystem Node runtime', () => {
  assert.equal(
    resolveWindowsNodeExecutable().endsWith(path.join('assets', 'dsh-node.exe')),
    true,
  )
})
