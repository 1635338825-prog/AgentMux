#!/usr/bin/env node
/** Windows desktop shell that reuses the shipped multi-agent Web surface. */

import { createInterface } from 'node:readline'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { newerVersion, resolveUpdateArtifact, supportedUpdateUrl } from './update.ts'

const APP_NAME = 'AgentMux'
const APP_VERSION = '0.1.2'
const DEFAULT_ORIGIN = 'http://127.0.0.1:3080/'
const READY_URL = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/u

interface DesktopState {
  launchUrl?: string
  projectRoot?: string
  startAtLogin?: boolean
  updateManifestUrl?: string
}

interface UpdateManifest {
  version: string
  url: string
  sha256: string
}

interface WebRuntimeHandoff {
  version: 1
  pid: number
  url: string
}

function statePath(): string {
  const base = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  return join(base, 'AgentMux', 'desktop.json')
}

function legacyStatePath(): string {
  const base = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  return join(base, 'DeepSeekHarness', 'desktop.json')
}

async function loadState(): Promise<DesktopState> {
  for (const path of [statePath(), legacyStatePath()]) {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as DesktopState
    } catch {
      // A fresh AgentMux install has neither file; an upgraded install falls back to the legacy path.
    }
  }
  return {}
}

async function updateState(patch: Partial<DesktopState>): Promise<void> {
  const path = statePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({ ...await loadState(), ...patch }, null, 2)}\n`, 'utf8')
}

function argument(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name)
  const value = at === -1 ? undefined : argv[at + 1]
  if (at !== -1 && value === undefined) throw new Error(`dsh-desktop: ${name} requires a value`)
  return value
}

function requestedUrl(argv: readonly string[]): string | undefined {
  const value = argument(argv, '--url')
  if (value === undefined) return undefined
  const url = new URL(value)
  if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')) {
    throw new Error('dsh-desktop: --url must be a loopback HTTP URL')
  }
  return url.href
}

function requestedUpdateUrl(argv: readonly string[]): string | undefined {
  const value = argument(argv, '--update-manifest')
  if (value === undefined) return undefined
  const url = new URL(value)
  if (!supportedUpdateUrl(url)) {
    throw new Error('dsh-desktop: --update-manifest must use HTTPS or loopback HTTP')
  }
  return url.href
}

async function serverRunning(): Promise<boolean> {
  try {
    const response = await fetch(DEFAULT_ORIGIN, { signal: AbortSignal.timeout(1_500), redirect: 'manual' })
    return response.status < 500
  } catch {
    return false
  }
}

async function runtimeLaunchUrl(): Promise<string | undefined> {
  try {
    const configuredHome = process.env.DSH_HOME?.trim()
    const home = configuredHome === undefined || configuredHome === ''
      ? join(homedir(), '.dsh')
      : configuredHome === '~'
        ? homedir()
        : /^[~][\\/]/u.test(configuredHome)
          ? join(homedir(), configuredHome.slice(2))
          : resolve(configuredHome)
    const path = join(home, 'runtime', 'web-3080.json')
    const record = JSON.parse(await readFile(path, 'utf8')) as Partial<WebRuntimeHandoff>
    if (record.version !== 1 || typeof record.pid !== 'number' || typeof record.url !== 'string') return undefined
    const url = new URL(record.url)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '3080' || url.pathname !== '/') return undefined
    const tokens = url.searchParams.getAll('token')
    if (tokens.length !== 1 || !/^[A-Za-z0-9_-]+$/u.test(tokens[0] ?? '')) return undefined
    return url.href
  } catch {
    return undefined
  }
}

function validProjectRoot(path: string | undefined): path is string {
  return path !== undefined
    && existsSync(join(path, 'package.json'))
    && existsSync(join(path, 'apps', 'cli', 'lib', 'bin.js'))
}

function projectRootOf(argv: readonly string[], state: DesktopState): string | undefined {
  const explicit = argument(argv, '--project-root')
  const candidates = [explicit === undefined ? undefined : resolve(explicit), state.projectRoot, process.cwd()]
  return candidates.find(validProjectRoot)
}

function cliInvocation(root: string): readonly [string, readonly string[]] {
  const built = join(root, 'apps', 'cli', 'lib', 'bin.js')
  return ['node', [built]]
}

async function startHarness(root: string | undefined): Promise<{ process: ChildProcess; url: string }> {
  if (root === undefined) {
    throw new Error('agentmux-desktop: the local service is not running and no built project root is configured; run AgentMux Setup from the built repository once')
  }
  const [program, prefix] = cliInvocation(root)
  const child = spawn(program, [
    ...prefix,
    '--profile', 'multi-agent',
    '--no-open',
    '--host', '127.0.0.1',
    '--port', '3080',
  ], {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stderr.on('data', (chunk: Buffer) => { process.stderr.write(chunk) })
  const lines = createInterface({ input: child.stdout })
  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new Error('agentmux-desktop: the local service did not become ready within 60 seconds')) }, 60_000)
    const finish = (callback: () => void): void => {
      clearTimeout(timeout)
      lines.close()
      callback()
    }
    lines.on('line', (line) => {
      const match = READY_URL.exec(line)
      const readyUrl = match?.[1]
      if (readyUrl !== undefined) finish(() => { resolve(readyUrl) })
    })
    child.once('error', (error) => { finish(() => { reject(error) }) })
    child.once('exit', (code) => { finish(() => { reject(new Error(`agentmux-desktop: the local service exited before startup (${String(code)})`)) }) })
  })
  await updateState({ launchUrl: url, projectRoot: root })
  return { process: child, url }
}

function installedExecutable(): string {
  const base = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  return join(base, 'Programs', 'AgentMux', 'AgentMux.exe')
}

function packaged(): boolean {
  return /^AgentMux(?:-Setup)?\.exe$/iu.test(basename(process.execPath))
}

async function waitForExit(child: ChildProcess, label: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${label} exited with code ${String(code)}`))
    })
  })
}

async function createShortcut(path: string, target: string, root: string): Promise<void> {
  const script = [
    '$shell = New-Object -ComObject WScript.Shell',
    '$shortcut = $shell.CreateShortcut($env:DSH_SHORTCUT_PATH)',
    '$shortcut.TargetPath = $env:DSH_SHORTCUT_TARGET',
    '$shortcut.Arguments = \'--project-root "\' + $env:DSH_SHORTCUT_ROOT + \'"\'',
    '$shortcut.WorkingDirectory = $env:DSH_SHORTCUT_ROOT',
    '$shortcut.IconLocation = $env:DSH_SHORTCUT_TARGET + \',0\'',
    '$shortcut.Description = \'AgentMux multi-agent control terminal\'',
    '$shortcut.Save()',
  ].join('; ')
  await waitForExit(spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
  ], {
    env: {
      ...process.env,
      DSH_SHORTCUT_PATH: path,
      DSH_SHORTCUT_TARGET: target,
      DSH_SHORTCUT_ROOT: root,
    },
    stdio: 'ignore',
    windowsHide: true,
  }), 'dsh-desktop: shortcut creation')
}

async function installApplication(root: string | undefined, startAtLogin: boolean): Promise<string> {
  if (!packaged()) throw new Error('agentmux-desktop: installation must run from AgentMux-Setup.exe')
  if (root === undefined) throw new Error('agentmux-desktop: installation requires a built AgentMux project root')
  const target = installedExecutable()
  await mkdir(dirname(target), { recursive: true })
  if (resolve(process.execPath).toLowerCase() !== resolve(target).toLowerCase()) await copyFile(process.execPath, target)
  const desktop = join(homedir(), 'Desktop', `${APP_NAME}.lnk`)
  const programs = join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  const startup = join(programs, 'Startup', `${APP_NAME}.lnk`)
  await createShortcut(desktop, target, root)
  await createShortcut(join(programs, `${APP_NAME}.lnk`), target, root)
  if (startAtLogin) await createShortcut(startup, target, root)
  else await rm(startup, { force: true })
  await Promise.all([
    join(homedir(), 'Desktop', 'DeepSeek Harness.lnk'),
    join(programs, 'DeepSeek Harness.lnk'),
    join(programs, 'Startup', 'DeepSeek Harness.lnk'),
  ].map(path => rm(path, { force: true })))
  await updateState({ projectRoot: root, startAtLogin })
  return target
}

async function maybeApplyUpdate(manifestUrl: string | undefined, root: string | undefined): Promise<boolean> {
  if (manifestUrl === undefined || root === undefined || !packaged()) return false
  if (resolve(process.execPath).toLowerCase() !== resolve(installedExecutable()).toLowerCase()) return false
  try {
    const manifestResponse = await fetch(manifestUrl, { signal: AbortSignal.timeout(5_000) })
    if (!manifestResponse.ok) return false
    const manifest = await manifestResponse.json() as UpdateManifest
    if (!newerVersion(manifest.version, APP_VERSION) || !/^[a-f0-9]{64}$/iu.test(manifest.sha256)) return false
    const artifactUrl = resolveUpdateArtifact(manifestUrl, manifest.url)
    if (artifactUrl === undefined) return false
    const response = await fetch(artifactUrl, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) return false
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex').toLowerCase() !== manifest.sha256.toLowerCase()) return false
    const updatePath = join(dirname(statePath()), 'Updates', `AgentMux-Setup-${manifest.version}.exe`)
    await mkdir(dirname(updatePath), { recursive: true })
    await writeFile(updatePath, bytes)
    await updateState({ updateManifestUrl: manifestUrl })
    const script = [
      'Wait-Process -Id ([int]$env:DSH_UPDATE_PID) -ErrorAction SilentlyContinue',
      'Copy-Item -LiteralPath $env:DSH_UPDATE_SOURCE -Destination $env:DSH_UPDATE_TARGET -Force',
      'Remove-Item -LiteralPath $env:DSH_UPDATE_SOURCE -Force -ErrorAction SilentlyContinue',
      '$arguments = \'--project-root "\' + $env:DSH_UPDATE_ROOT + \'"\'',
      'Start-Process -FilePath $env:DSH_UPDATE_TARGET -ArgumentList $arguments -WindowStyle Hidden',
    ].join('; ')
    spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script,
    ], {
      detached: true,
      env: {
        ...process.env,
        DSH_UPDATE_PID: String(process.pid),
        DSH_UPDATE_SOURCE: updatePath,
        DSH_UPDATE_TARGET: process.execPath,
        DSH_UPDATE_ROOT: root,
      },
      stdio: 'ignore',
      windowsHide: true,
    }).unref()
    return true
  } catch {
    // Update checks are best-effort and never block the local application.
    return false
  }
}

function edgeExecutable(): string {
  const candidates = [
    join(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(process.env.PROGRAMFILES ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]
  const found = candidates.find(path => existsSync(path))
  if (found === undefined) throw new Error('dsh-desktop: Microsoft Edge WebView runtime was not found')
  return found
}

async function openDesktopWindow(url: string): Promise<void> {
  const profile = join(dirname(statePath()), 'EdgeProfile')
  await mkdir(profile, { recursive: true })
  const window = spawn(edgeExecutable(), [
    `--app=${url}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-features=Translate',
  ], { stdio: 'ignore', windowsHide: false })
  await new Promise<void>((resolve, reject) => {
    window.once('error', reject)
    window.once('exit', () => { resolve() })
  })
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const explicit = requestedUrl(argv)
  const requestedManifest = requestedUpdateUrl(argv)
  const state = await loadState()
  const root = projectRootOf(argv, state)
  const isSetup = /-Setup\.exe$/iu.test(basename(process.execPath)) || argv.includes('--install')
  if (isSetup) {
    const target = await installApplication(root, !argv.includes('--no-startup'))
    if (explicit !== undefined) await updateState({ launchUrl: explicit })
    if (requestedManifest !== undefined) await updateState({ updateManifestUrl: requestedManifest })
    spawn(target, [
      ...root === undefined ? [] : ['--project-root', root],
      ...explicit === undefined ? [] : ['--url', explicit],
    ], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
    return
  }
  if (requestedManifest !== undefined) await updateState({ updateManifestUrl: requestedManifest })
  if (await maybeApplyUpdate(requestedManifest ?? state.updateManifestUrl, root)) return
  let owned: ChildProcess | undefined
  let url: string
  if (await serverRunning()) {
    url = explicit ?? await runtimeLaunchUrl() ?? state.launchUrl ?? DEFAULT_ORIGIN
  } else {
    const started = await startHarness(root)
    owned = started.process
    url = started.url
  }
  if (explicit !== undefined) await updateState({ launchUrl: explicit })
  try {
    await openDesktopWindow(url)
  } finally {
    owned?.kill('SIGTERM')
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
