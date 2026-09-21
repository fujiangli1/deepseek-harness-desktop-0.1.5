import { accessSync, constants, readdirSync } from 'node:fs'
import path from 'node:path'

// Where a packaged build keeps its dsh home.
//
// A packaged build is normally started by double-clicking its executable, so
// nothing has exported DSH_HOME and dsh would fall back to the shared ~/.dsh.
// That home is not necessarily wrong, but its profile pins whichever core was
// installed there and dsh may rewrite it in place - so a fork running a
// different core must not share it.
//
// Which home is correct depends on how the build was shipped:
//
// - An installed build - the NSIS installer drops `Uninstall <product>.exe`
//   beside the executable - must keep its home under userData. The installer
//   replaces the installation directory wholesale on upgrade, so a home beside
//   the executable, and with it every credential and session, is destroyed by
//   the next version.
// - A portable build keeps the home beside the executable, which is what makes
//   the folder self-contained and movable.
//
// An explicit DSH_HOME always wins.
export function resolveDshHome({
  environment = process.env,
  executablePath,
  userDataPath,
  isInstalled = isInstalledBuild,
  isWritable = canWrite,
} = {}) {
  if (environment.DSH_HOME) return environment.DSH_HOME
  const appDirectory = path.dirname(executablePath)
  if (isInstalled(appDirectory)) return path.join(userDataPath, 'dsh-home')
  return isWritable(appDirectory)
    ? path.join(appDirectory, 'dsh-home')
    : path.join(userDataPath, 'dsh-home')
}

// The NSIS installer writes an uninstaller named after the product next to the
// executable. Neither the portable build nor the development tree has one.
export function isInstalledBuild(appDirectory) {
  try {
    return readdirSync(appDirectory).some(
      name => name.startsWith('Uninstall ') && name.endsWith('.exe'),
    )
  } catch {
    return false
  }
}

function canWrite(directory) {
  try {
    accessSync(directory, constants.W_OK)
    return true
  } catch {
    return false
  }
}
