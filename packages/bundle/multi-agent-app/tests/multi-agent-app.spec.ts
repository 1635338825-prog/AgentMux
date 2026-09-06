/** The multi-agent bundle is a static profile patch and dependency carrier. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import * as yaml from 'js-yaml'
import { describe, expect, it } from 'vitest'

describe('dsh-multi-agent-app bundle', () => {
  it('selects the orchestration preset and mounts all product providers', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }

    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-subagent-codex')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-subagent-claude-code')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-subagent-doubao-desktop')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-subagent-qwen')

    const patches = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{
      id?: string
      config?: { default?: string }
      insert?: Array<{ id?: string; name?: string; config?: Record<string, unknown> }>
    }>

    expect(patches.find(patch => patch.id === 'agent-presets')?.config)
      .toEqual({ default: 'multi-agent' })
    const rows = patches.flatMap(patch => patch.insert ?? [])
    expect(rows).toEqual([
      { id: 'subagent-codex', name: '@deepseek-ai/dsh-subagent-codex' },
      { id: 'subagent-claude-code', name: '@deepseek-ai/dsh-subagent-claude-code' },
      {
        id: 'subagent-doubao-desktop',
        name: '@deepseek-ai/dsh-subagent-doubao-desktop',
        config: { cdpUrl: 'http://127.0.0.1:9225' },
      },
      {
        id: 'subagent-qwen',
        name: '@deepseek-ai/dsh-subagent-qwen',
        config: {
          command: String.raw`C:\Program Files\Volta\volta.exe`,
          commandArgs: ['run', 'bl'],
        },
      },
    ])
  })
})
