import { describe, expect, it } from 'vitest'
import { parseAgentSelection, writeAgentSelection } from '../src/client/agent-selection.ts'

describe('Agent selection draft policy', () => {
  it('round-trips selected product models without changing the task body', () => {
    const draft = writeAgentSelection('完成这个任务', {
      codex: 'gpt-5.6-sol',
      qwen: 'qwen3.8-max',
    })
    expect(parseAgentSelection(draft)).toEqual({ codex: 'gpt-5.6-sol', qwen: 'qwen3.8-max' })
    expect(draft.endsWith('\n完成这个任务')).toBe(true)
  })

  it('represents DeepSeek-only mode and can restore automatic orchestration', () => {
    const manual = writeAgentSelection('任务', {})
    expect(manual).toBe('[HARNESS_AGENT_SELECTION none]\n任务')
    expect(parseAgentSelection(manual)).toEqual({})
    expect(writeAgentSelection(manual, null)).toBe('任务')
  })
})
