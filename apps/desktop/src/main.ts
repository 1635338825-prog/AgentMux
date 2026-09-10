/** AgentMux native desktop entry. */

import { join, resolve } from 'node:path'
import { app, BrowserWindow, dialog, Menu, nativeTheme, shell } from 'electron'
import electronUpdater, { type AppUpdater, type UpdateInfo } from 'electron-updater'
import { authenticatedLoopbackUrl, connectHarness, type HarnessConnection } from './harness.ts'

let mainWindow: BrowserWindow | undefined
let harness: HarnessConnection | undefined
let quitting = false

function desktopUpdater(): AppUpdater {
  const { autoUpdater } = electronUpdater
  return autoUpdater
}

function reportUpdateError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`agentmux-desktop: update failed (${message})`)
}

async function offerUpdateDownload(info: UpdateInfo): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'AgentMux 更新可用',
    message: `发现 AgentMux ${info.version}。`,
    detail: '是否现在下载更新？下载完成后，你可以选择立即重启安装。',
    buttons: ['下载更新', '稍后'],
    defaultId: 0,
    cancelId: 1,
  })
  if (result.response === 0) await desktopUpdater().downloadUpdate()
}

async function offerUpdateInstall(): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: 'AgentMux 更新已就绪',
    message: '更新已经下载完成。',
    detail: '是否立即重启 AgentMux 并安装更新？',
    buttons: ['立即重启安装', '退出时安装'],
    defaultId: 0,
    cancelId: 1,
  })
  if (result.response === 0) desktopUpdater().quitAndInstall()
}

function configureAutoUpdates(): void {
  if (!app.isPackaged) return
  const updater = desktopUpdater()
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = true
  updater.on('update-available', (info) => { void offerUpdateDownload(info).catch(reportUpdateError) })
  updater.on('update-downloaded', () => { void offerUpdateInstall().catch(reportUpdateError) })
  updater.on('error', reportUpdateError)
  const check = (): void => {
    void updater.checkForUpdates().catch(reportUpdateError)
  }
  setTimeout(check, 10_000).unref()
  setInterval(check, 6 * 60 * 60 * 1000).unref()
}

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
  const packagedRuntimeRoot = app.isPackaged
    ? join(process.resourcesPath, 'runtime', 'node_modules', '@deepseek-ai', 'dsh')
    : undefined
  harness = await connectHarness({
    argv: process.argv.slice(1),
    ...(developmentRoot === undefined ? {} : { developmentRoot }),
    ...(packagedRuntimeRoot === undefined ? {} : { packagedRuntimeRoot }),
    executable: process.execPath,
  })
  await createMainWindow(harness.url)
  configureAutoUpdates()
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
