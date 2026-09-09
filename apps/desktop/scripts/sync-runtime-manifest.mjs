import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = resolve(scriptDir, '..', '..', '..')
const runtimeManifestPath = join(workspaceRoot, 'apps', 'desktop-runtime', 'package.json')
const scanRoots = ['apps', 'packages', 'vendor']
const seeds = [
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-multi-agent-app',
]

async function packageManifests(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(root, entry.name)
    try {
      const manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'))
      if (typeof manifest.name === 'string') result.push([manifest.name, manifest])
    } catch {
      result.push(...await packageManifests(path))
    }
  }
  return result
}

const workspacePackages = new Map()
for (const root of scanRoots) {
  for (const entry of await packageManifests(join(workspaceRoot, root))) {
    workspacePackages.set(...entry)
  }
}

const dependencies = new Set()
const queue = [...seeds]
while (queue.length > 0) {
  const name = queue.shift()
  if (dependencies.has(name)) continue
  const manifest = workspacePackages.get(name)
  if (manifest === undefined) throw new Error(`Unknown AgentMux runtime workspace package: ${name}`)
  dependencies.add(name)
  for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const dependency of Object.keys(manifest[group] ?? {})) {
      if (workspacePackages.has(dependency) && !dependencies.has(dependency)) queue.push(dependency)
    }
  }
}

const manifest = {
  name: '@agentmux/desktop-runtime',
  description: 'Generated production dependency closure embedded in AgentMux Desktop',
  version: '0.1.2-rc.1',
  publishConfig: { access: 'public' },
  repository: {
    type: 'git',
    url: 'git+https://github.com/deepseek-ai/deepseek-harness.git',
    directory: 'apps/desktop-runtime',
  },
  type: 'module',
  license: 'MIT',
  dependencies: Object.fromEntries([...dependencies].sort().map(name => [name, 'workspace:^'])),
}
const content = `${JSON.stringify(manifest, null, 2)}\n`
if (process.argv.includes('--check')) {
  const existing = await readFile(runtimeManifestPath, 'utf8').catch(() => '')
  if (existing !== content) throw new Error('Desktop runtime manifest is stale; run pnpm desktop:runtime:sync')
} else {
  await writeFile(runtimeManifestPath, content, 'utf8')
  process.stdout.write(`AgentMux desktop runtime manifest: ${dependencies.size} workspace packages\n`)
}
