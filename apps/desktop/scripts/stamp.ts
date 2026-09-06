/** Stamp the Windows executable and emit its update manifest. */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as ResEdit from 'resedit'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
const executable = resolve(dist, 'AgentMux.exe')
const setup = resolve(dist, 'AgentMux-Setup.exe')
const icon = resolve(root, 'assets', 'harness-desktop.ico')
const version = '0.1.2'

await mkdir(dist, { recursive: true })
const iconFile = ResEdit.Data.IconFile.from(await readFile(icon))

async function stamp(source: string, destination: string, description: string, originalFilename: string): Promise<void> {
  const executableData = ResEdit.NtExecutable.from(await readFile(source), { ignoreCert: true })
  const resources = ResEdit.NtExecutableResource.from(executableData)
  const existingIcon = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries)[0]
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    resources.entries,
    existingIcon?.id ?? 101,
    existingIcon?.lang ?? 1033,
    iconFile.icons.map(item => item.data),
  )
  const versionInfo = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0]
    ?? ResEdit.Resource.VersionInfo.createEmpty()
  versionInfo.lang = 1033
  versionInfo.setFileVersion(version, 1033)
  versionInfo.setProductVersion(version, 1033)
  versionInfo.setStringValues({ lang: 1033, codepage: 1200 }, {
    ProductName: 'AgentMux',
    FileDescription: description,
    CompanyName: 'AgentMux',
    OriginalFilename: originalFilename,
  })
  versionInfo.outputToResourceEntries(resources.entries)
  resources.outputResource(executableData)
  await writeFile(destination, Buffer.from(executableData.generate()))
}

await stamp(executable, `${executable}.stamped`, 'AgentMux Multi-Agent Control Terminal', 'AgentMux.exe')
await stamp(`${executable}.stamped`, setup, 'AgentMux Setup', 'AgentMux-Setup.exe')
await writeFile(executable, await readFile(`${executable}.stamped`))
await rm(`${executable}.stamped`, { force: true })
const sha256 = createHash('sha256').update(await readFile(setup)).digest('hex')
await writeFile(resolve(dist, 'latest.json'), `${JSON.stringify({
  version,
  url: 'AgentMux-Setup.exe',
  sha256,
}, null, 2)}\n`, 'utf8')
