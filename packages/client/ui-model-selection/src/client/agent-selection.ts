/** Draft-carried execution policy shared by the Agent selector and coordinator persona. */

import type { AgentSelection as DurableAgentSelection } from '@deepseek-ai/dsh-api-session-controller/types'

export const AGENT_SELECTION_PREFIX = '[HARNESS_AGENT_SELECTION '
const AGENT_SELECTION_SUFFIX = ']'

export type AgentSelection = DurableAgentSelection

/** Read an execution policy only when it is the draft's first line. Null means automatic orchestration. */
export function parseAgentSelection(draft: string): AgentSelection | null {
  const [line] = draft.split('\n', 1)
  if (!line?.startsWith(AGENT_SELECTION_PREFIX) || !line.endsWith(AGENT_SELECTION_SUFFIX)) return null
  const value = line.slice(AGENT_SELECTION_PREFIX.length, -AGENT_SELECTION_SUFFIX.length)
  if (value === 'none') return {}
  const entries = value.split(',').flatMap((entry): Array<[string, string]> => {
    const at = entry.indexOf('=')
    if (at <= 0 || at === entry.length - 1) return []
    return [[entry.slice(0, at), entry.slice(at + 1)]]
  })
  return Object.fromEntries(entries)
}

/** Replace or remove the first-line policy while preserving the user's task text exactly. */
export function writeAgentSelection(draft: string, selection: AgentSelection | null): string {
  const firstBreak = draft.indexOf('\n')
  const first = firstBreak === -1 ? draft : draft.slice(0, firstBreak)
  const body = first.startsWith(AGENT_SELECTION_PREFIX) && first.endsWith(AGENT_SELECTION_SUFFIX)
    ? (firstBreak === -1 ? '' : draft.slice(firstBreak + 1))
    : draft
  if (selection === null) return body
  const pairs = Object.entries(selection).map(([agent, model]) => `${agent}=${model}`)
  const policy = `${AGENT_SELECTION_PREFIX}${pairs.length === 0 ? 'none' : pairs.join(',')}${AGENT_SELECTION_SUFFIX}`
  return body.length === 0 ? `${policy}\n` : `${policy}\n${body}`
}
