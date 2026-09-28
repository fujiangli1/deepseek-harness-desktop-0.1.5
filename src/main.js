import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeImage,
  nativeTheme,
  shell,
  Tray,
} from 'electron'
import { resolveDshHome } from './dsh-home.js'
import { startDshService } from './dsh-service.js'
import { applyMacTitleBarStyle } from './mac-titlebar.js'
import { createWindowOptions } from './window-options.js'
import { createTrayMenuTemplate, shouldHideWindowOnClose } from './window-lifecycle.js'
import { applyWindowsTitleBarStyle } from './windows-titlebar.js'

// Distinct from upstream's 'DeepSeek Harness' on purpose: Electron derives the
// userData directory from the app name, and requestSingleInstanceLock() keys on
// that directory. Reusing the name would collide with an already-running 0.3.8
// install and this fork would silently quit on launch.
const APP_NAME = 'DeepSeek Harness 0.1.5'
const STARTUP_PAGE = fileURLToPath(new URL('./startup.html', import.meta.url))
const TRAY_ICON = fileURLToPath(new URL('../assets/tray.png', import.meta.url))
const TRAY_TEMPLATE_ICON = fileURLToPath(new URL('../assets/trayTemplate.png', import.meta.url))

let mainWindow
let service
let serviceUrl
let tray
let trayAvailable = false
let isQuitting = false

app.setName(APP_NAME)



async function showMainWindow() {
  if (!mainWindow) {
    await createWindow()
    if (serviceUrl) await mainWindow?.loadURL(serviceUrl)
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function openInBrowser() {
  try {
    const url = serviceUrl ?? await service?.ready
    if (url) await shell.openExternal(url)
  } catch (error) {
    console.warn(`Could not open Harness in the browser: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function createWindow() {
  if (process.platform === 'win32') Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow(createWindowOptions(process.platform, nativeTheme.shouldUseDarkColors))

  if (process.platform === 'win32') {
    mainWindow.setMenu(null)
    mainWindow.setMenuBarVisibility(false)
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL()
    if (currentUrl && new URL(url).origin !== new URL(currentUrl).origin) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    if (process.platform === 'darwin') void applyMacTitleBarStyle(mainWindow.webContents)
    if (process.platform === 'win32') void applyWindowsTitleBarStyle(mainWindow.webContents)
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (event) => {
    if (!shouldHideWindowOnClose(isQuitting, trayAvailable)) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => {
    mainWindow = undefined
  })

  return mainWindow.loadFile(STARTUP_PAGE)
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(
    process.platform === 'darwin' ? TRAY_TEMPLATE_ICON : TRAY_ICON,
  )
  if (process.platform === 'darwin') trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(Menu.buildFromTemplate(createTrayMenuTemplate({
    locale: app.getLocale(),
    showWindow: () => void showMainWindow(),
    openInBrowser: () => void openInBrowser(),
    hideWindow: () => mainWindow?.hide(),
    quit: () => {
      isQuitting = true
      app.quit()
    },
  })))
  tray.on('click', () => void showMainWindow())
  trayAvailable = true
}

// Where the kernel's own output is kept. A launch that fails now leaves this
// behind instead of vanishing with the dialog.
function kernelLogPath() {
  return path.join(app.getPath('userData'), 'dsh-kernel.log')
}

function startKernel(dshHome) {
  service = startDshService({
    electronExecutable: process.execPath,
    environment: {
      ...process.env,
      NODE_OPTIONS: '',
      DSH_DESKTOP: '1',
      DSH_HOME: dshHome,
    },
    logPath: kernelLogPath(),
  })
  return service.ready
}

// A first launch can genuinely take minutes: the profile has to be built before
// the kernel loads its plugin tree, and the kernel announces nothing until it is
// done. Offer a way forward rather than a dead end, and point at the log for the
// case where retrying is not the answer. Returns the chosen button index:
// 0 try again, 1 open the log folder, 2 quit.
async function askAfterFailedStart(message) {
  const chinese = app.getLocale().toLowerCase().startsWith('zh')
  const buttons = chinese
    ? ['重试', '打开日志文件夹', '退出']
    : ['Try again', 'Open log folder', 'Quit']
  const hint = chinese
    ? '如果这是第一次启动，初始化可能需要几分钟，重试通常就能成功。'
    : 'If this is the first launch, initialisation can take several minutes; trying again usually succeeds.'

  const { response } = await dialog.showMessageBox({
    type: 'error',
    title: chinese ? `${APP_NAME} 启动失败` : `${APP_NAME} failed to start`,
    message: chinese ? 'DeepSeek Harness 无法启动。' : 'DeepSeek Harness could not start.',
    detail: `${message}\n\n${hint}`,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true,
  })
  return response
}

async function launch() {
  const startupReady = createWindow()
  try {
    createTray()
  } catch (error) {
    console.warn(`System tray is unavailable: ${error instanceof Error ? error.message : String(error)}`)
  }

  const dshHome = resolveDshHome({
    executablePath: app.getPath('exe'),
    userDataPath: app.getPath('userData'),
  })
  console.log(`${APP_NAME} starting with DSH_HOME=${dshHome}`)

  for (;;) {
    try {
      serviceUrl = await startKernel(dshHome)
      break
    } catch (error) {
      service?.stop()
      const choice = await askAfterFailedStart(error instanceof Error ? error.message : String(error))
      if (choice === 2) {
        app.quit()
        return
      }
      if (choice === 1) shell.showItemInFolder(kernelLogPath())
      // Both "try again" and "open the log folder" land back in the loop.
    }
  }

  await startupReady
  await mainWindow?.loadURL(serviceUrl)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    void showMainWindow()
  })

  app.whenReady().then(launch)
}

app.on('activate', () => {
  void showMainWindow()
})

app.on('window-all-closed', () => {
  if (isQuitting || (!trayAvailable && process.platform !== 'darwin')) app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  service?.stop()
})
