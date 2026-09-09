/** AgentMux native desktop entry. */

import { join, resolve } from 'node:path'
import { app, BrowserWindow, dialog, Menu, nativeTheme, shell } from 'electron'
import { authenticatedLoopbackUrl, connectHarness, type HarnessConnection } from './harness.ts'

let mainWindow: BrowserWindow | undefined
let harness: HarnessConnection | undefined
let quitting = false

function showMainWindow(): void {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function allowedNavigation(value: string): boolean {
  return authenticatedLoopbackUrl(value) !== undefined || value === 'http://127.0.0.1:3080/'
}

async function openExternal(value: string): Promise<void> {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' || url.protocol === 'mailto:') await shell.openExternal(url.href)
  } catch {
    // Invalid and non-Web targets remain blocked inside the desktop shell.
  }
}

async function createMainWindow(url: string): Promise<void> {
  const icon = join(app.getAppPath(), 'assets', 'harness-desktop.png')
  Menu.setApplicationMenu(null)
  nativeTheme.themeSource = 'system'
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    title: 'AgentMux',
    icon,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d12',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => { showMainWindow() })
  mainWindow.on('closed', () => { mainWindow = undefined })
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (allowedNavigation(target)) void mainWindow?.loadURL(target)
    else void openExternal(target)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (allowedNavigation(target)) return
    event.preventDefault()
    void openExternal(target)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`agentmux-desktop: renderer stopped (${details.reason}); reloading`)
    if (mainWindow !== undefined && !mainWindow.isDestroyed()) mainWindow.webContents.reload()
  })
  await mainWindow.loadURL(url)
}

async function start(): Promise<void> {
  const developmentRoot = app.isPackaged ? undefined : resolve(app.getAppPath(), '..', '..')
  harness = await connectHarness({
    argv: process.argv.slice(1),
    ...(developmentRoot === undefined ? {} : { developmentRoot }),
    executable: process.execPath,
  })
  await createMainWindow(harness.url)
}

app.setName('AgentMux')
app.setAppUserModelId('com.agentmux.desktop')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => { showMainWindow() })
  app.on('activate', () => { showMainWindow() })
  app.on('before-quit', () => {
    quitting = true
    harness?.process?.kill('SIGTERM')
  })
  void app.whenReady().then(start).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      title: 'AgentMux could not start',
      message: 'AgentMux could not start its local Harness service.',
      detail: message,
    })
    app.quit()
  })
}

app.on('window-all-closed', () => {
  if (!quitting) app.quit()
})
