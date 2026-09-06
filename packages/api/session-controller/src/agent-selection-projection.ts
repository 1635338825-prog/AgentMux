/** Durable product-Agent routing policy projection. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { AgentSelection } from './types.ts'

const agentSelectionSchema = z.record(z.string().min(1), z.string().min(1)).nullable() as z.ZodType<AgentSelection>

const agentSelectionProjection = {
  key: 'agentSelection',
  stateSchema: agentSelectionSchema,
  init: () => null,
  apply: (state: AgentSelection, event: SessionEvent): AgentSelection =>
    event.type === 'agent/selection' ? event.data.selection : state,
  wire: {
    viewSchema: agentSelectionSchema,
    view: state => state,
  },
  stateVersion: 1,
} satisfies ProjectionDefinition<'agentSelection', AgentSelection>

/** Register the durable product-Agent selection projection. */
export function installAgentSelectionProjection(ctx: Context): void {
  ctx.sessionProjections.register(agentSelectionProjection)
}
