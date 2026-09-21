import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { isInstalledBuild, resolveDshHome } from '../src/dsh-home.js'

const EXE = path.join('C:', 'apps', 'DeepSeek Harness 0.1.5', 'DeepSeek Harness 0.1.5.exe')
const APP_DIR = path.dirname(EXE)
const USER_DATA = path.join('C:', 'Users', 'someone', 'AppData', 'Roaming', 'DeepSeek Harness 0.1.5')

test('an explicit DSH_HOME always wins', () => {
  assert.equal(
    resolveDshHome({
      environment: { DSH_HOME: 'D:\\custom-home' },
      executablePath: EXE,
      userDataPath: USER_DATA,
      isInstalled: () => true,
    }),
    'D:\\custom-home',
  )
})

test('an installed build keeps its home under userData, out of the installer\'s reach', () => {
  assert.equal(
    resolveDshHome({
      environment: {},
      executablePath: EXE,
      userDataPath: USER_DATA,
      isInstalled: () => true,
      isWritable: () => true,
    }),
    path.join(USER_DATA, 'dsh-home'),
  )
})

test('a portable build keeps its home beside the executable', () => {
  assert.equal(
    resolveDshHome({
      environment: {},
      executablePath: EXE,
      userDataPath: USER_DATA,
      isInstalled: () => false,
      isWritable: () => true,
    }),
    path.join(APP_DIR, 'dsh-home'),
  )
})

test('a read-only application directory falls back to userData', () => {
  assert.equal(
    resolveDshHome({
      environment: {},
      executablePath: EXE,
      userDataPath: USER_DATA,
      isInstalled: () => false,
      isWritable: () => false,
    }),
    path.join(USER_DATA, 'dsh-home'),
  )
})

test('the NSIS uninstaller is what marks a build as installed', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'dsh-home-test-'))
  try {
    assert.equal(isInstalledBuild(directory), false)
    writeFileSync(path.join(directory, 'DeepSeek Harness 0.1.5.exe'), '')
    assert.equal(isInstalledBuild(directory), false, 'the application itself is not the marker')
    writeFileSync(path.join(directory, 'Uninstall DeepSeek Harness 0.1.5.exe'), '')
    assert.equal(isInstalledBuild(directory), true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('isInstalledBuild tolerates an unreadable directory', () => {
  assert.equal(isInstalledBuild(path.join(os.tmpdir(), 'dsh-home-absent-3f9a1c')), false)
})
