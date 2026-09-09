/** Local Harness lifecycle shared by the AgentMux Electron shell. */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

export const DEFAULT_ORIGIN = 'http://127.0.0.1:3080/'
const READY_URL = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+)/u

interface DesktopState {
  runtimeRoot?: string
  /** Compatibility with the first desktop preview. */
  projectRoot?: string
}

interface WebRuntimeHandoff {
  version: 1
  pid: number
  url: string
}

export interface HarnessConnection {
  process?: ChildProcess
  url: string
}

function statePath(): string {
  const base = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  return join(base, 'AgentMux', 'desktop.json')
}

function dshHome(): string {
  const configured = process.env.DSH_HOME?.trim()
  if (configured === undefined || configured === '') return join(homedir(), '.dsh')
  if (configured === '~') return homedir()
  if (/^[~][\\/]/u.test(configured)) return join(homedir(), configured.slice(2))
  return resolve(configured)
}

async function loadState(): Promise<DesktopState> {
  try {
    return JSON.parse(await readFile(statePath(), 'utf8')) as DesktopState
  } catch {
    return {}
  }
}

async function saveRuntimeRoot(runtimeRoot: string): Promise<void> {
  const path = statePath()
  const state = await loadState()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify({ ...state, runtimeRoot }, null, 2)}\n`, 'utf8')
}

function argument(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name)
  const value = at === -1 ? undefined : argv[at + 1]
  if (at !== -1 && value === undefined) throw new Error(`agentmux-desktop: ${name} requires a value`)
  return value
}

export function runtimeCliPath(path: string | undefined): string | undefined {
  if (path === undefined || !existsSync(join(path, 'package.json'))) return undefined
  const standalone = join(path, 'lib', 'bin.js')
  if (existsSync(standalone)) return standalone
  const workspace = join(path, 'apps', 'cli', 'lib', 'bin.js')
  return existsSync(workspace) ? workspace : undefined
}

export function validProjectRoot(path: string | undefined): path is string {
  return runtimeCliPath(path) !== undefined
}

export async function resolveRuntimeRoot(
  argv: readonly string[],
  developmentRoot?: string,
  packagedRuntimeRoot?: string,
): Promise<string | undefined> {
  const state = await loadState()
  const explicit = argument(argv, '--project-root')
  const candidates = [
    packagedRuntimeRoot,
    explicit === undefined ? undefined : resolve(explicit),
    process.env.AGENTMUX_PROJECT_ROOT,
    state.runtimeRoot,
    state.projectRoot,
    developmentRoot,
    process.cwd(),
  ]
  return candidates.find(validProjectRoot)
}

export function authenticatedLoopbackUrl(value: unknown, port = 3080): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || Number(url.port) !== port || url.pathname !== '/') return undefined
    const tokens = url.searchParams.getAll('token')
    if (tokens.length !== 1 || !/^[A-Za-z0-9_-]+$/u.test(tokens[0] ?? '')) return undefined
    return url.href
  } catch {
    return undefined
  }
}

async function runtimeLaunchUrl(): Promise<string | undefined> {
  try {
    const path = join(dshHome(), 'runtime', 'web-3080.json')
    const record = JSON.parse(await readFile(path, 'utf8')) as Partial<WebRuntimeHandoff>
    if (record.version !== 1 || typeof record.pid !== 'number') return undefined
    return authenticatedLoopbackUrl(record.url)
  } catch {
    return undefined
  }
}

async function existingHarnessUrl(): Promise<string | undefined> {
  const url = await runtimeLaunchUrl()
  if (url === undefined) return undefined
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
    return response.ok ? url : undefined
  } catch {
    return undefined
  }
}

async function startHarness(runtimeRoot: string, executable: string): Promise<HarnessConnection> {
  const cli = runtimeCliPath(runtimeRoot)
  if (cli === undefined) throw new Error('agentmux-desktop: invalid Harness runtime')
  const child = spawn(executable, [
    cli,
    '--profile', 'multi-agent',
    '--no-open',
    '--host', '127.0.0.1',
    '--port', '3080',
  ], {
    cwd: runtimeRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  child.stderr.on('data', (chunk: Buffer) => { process.stderr.write(chunk) })
  const lines = createInterface({ input: child.stdout })
  const url = await new Promise<string>((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('agentmux-desktop: Harness did not become ready within 60 seconds'))
    }, 60_000)
    const finish = (callback: () => void): void => {
      clearTimeout(timeout)
      callback()
    }
    lines.on('line', (line) => {
      const readyUrl = READY_URL.exec(line)?.[1]
      if (readyUrl !== undefined) finish(() => { resolvePromise(readyUrl) })
    })
    child.once('error', (error) => { finish(() => { reject(error) }) })
    child.once('exit', (code) => {
      finish(() => { reject(new Error(`agentmux-desktop: Harness exited during startup (${String(code)})`)) })
    })
  })
  await saveRuntimeRoot(runtimeRoot)
  return { process: child, url }
}

export async function connectHarness(options: {
  argv: readonly string[]
  developmentRoot?: string
  packagedRuntimeRoot?: string
  executable: string
}): Promise<HarnessConnection> {
  const existing = await existingHarnessUrl()
  if (existing !== undefined) return { url: existing }
  const runtimeRoot = await resolveRuntimeRoot(
    options.argv,
    options.developmentRoot,
    options.packagedRuntimeRoot,
  )
  if (runtimeRoot === undefined) {
    throw new Error('AgentMux cannot find its embedded Harness runtime. Reinstall AgentMux.')
  }
  return startHarness(runtimeRoot, options.executable)
}
