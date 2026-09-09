import { lstat, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(scriptDir, '..')
const workspaceRoot = resolve(desktopDir, '..', '..')
const runtimeDir = join(desktopDir, 'runtime')
const removableDirectories = new Set(['.github', '__tests__', 'docs', 'examples', 'test', 'tests'])
const removableExtensions = new Set(['.cts', '.d.ts', '.h', '.map', '.mts', '.pdb', '.ts'])

async function pruneRuntime(path) {
  let removedBytes = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (removableDirectories.has(entry.name) || entry.name === 'win32-arm64') {
        const files = await readdir(child, { recursive: true, withFileTypes: true })
        for (const file of files) {
          if (file.isFile()) removedBytes += (await lstat(join(file.parentPath, file.name))).size
        }
        await rm(child, { recursive: true, force: true })
      } else {
        removedBytes += await pruneRuntime(child)
      }
      continue
    }
    const lower = entry.name.toLowerCase()
    const extension = lower.endsWith('.d.ts') ? '.d.ts' : lower.slice(lower.lastIndexOf('.'))
    if (removableExtensions.has(extension) || /^readme(?:\.|$)/u.test(lower)) {
      removedBytes += (await lstat(child)).size
      await rm(child, { force: true })
    }
  }
  return removedBytes
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: { ...process.env, CI: 'true', npm_config_confirm_modules_purge: 'false' },
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('exit', code => code === 0
      ? resolvePromise()
      : reject(new Error(`${command} exited with code ${code}`)))
  })
}

if (!process.argv.includes('--finalize-only')) {
  await run(process.execPath, [join(scriptDir, 'sync-runtime-manifest.mjs'), '--check'])
  await rm(runtimeDir, { recursive: true, force: true })
  const pnpmScript = process.env.npm_execpath
  if (pnpmScript === undefined || pnpmScript === '') throw new Error('pnpm executable path is unavailable')
  await run(process.execPath, [pnpmScript,
    '--config.inject-workspace-packages=true',
    '--config.node-linker=hoisted',
    '--filter', '@agentmux/desktop-runtime',
    'deploy', '--prod', '--ignore-scripts', runtimeDir,
  ])
}

const cliManifestPath = join(runtimeDir, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
const cliManifest = JSON.parse(await readFile(cliManifestPath, 'utf8'))
cliManifest.dsh.configTrees = cliManifest.dsh.configTrees.map(tree => ({
  ...tree,
  path: tree.path === '../../packages/preset/agent-presets/presets'
    ? '../dsh-agent-presets/presets'
    : tree.path,
}))
const cliManifestReplacement = `${cliManifestPath}.agentmux`
await writeFile(cliManifestReplacement, `${JSON.stringify(cliManifest, null, 2)}\n`, 'utf8')
await rename(cliManifestReplacement, cliManifestPath)

const removedBytes = await pruneRuntime(runtimeDir)
process.stdout.write(
  `AgentMux standalone runtime prepared at ${runtimeDir} (${(removedBytes / 1024 / 1024).toFixed(1)} MiB pruned)\n`,
)
