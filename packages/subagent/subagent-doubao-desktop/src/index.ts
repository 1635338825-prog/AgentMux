/** One-shot Doubao Desktop subagent provider over a local CDP bridge. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import {
  NO_START_CAPABILITIES,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
  type SubagentResult,
  type SubagentRun,
} from '@deepseek-ai/dsh-subagent'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  DEFAULT_CDP_URL,
  DEFAULT_CHAT_URL,
  openDoubao,
  runDoubao,
  type CdpConnection,
} from './cdp.ts'

export const name = 'subagent-doubao-desktop'
export const inject = ['subagents']

const DEFAULT_PROVIDER_NAME = 'doubao-desktop'
const DEFAULT_TIMEOUT_MS = 180_000
const DEFAULT_POLL_INTERVAL_MS = 2_000
const DEFAULT_STABLE_POLLS = 2

export interface Config {
  /** Provider name on `ctx.subagents` (default `doubao-desktop`). */
  providerName?: string
  /** User-enabled local Chrome DevTools endpoint. */
  cdpUrl?: string
  /** Visible Doubao chat page opened for each one-shot request. */
  chatUrl?: string
  /** Whole startup and response timeout. */
  timeoutMs?: number
  /** Delay between visible reply observations. */
  pollIntervalMs?: number
  /** Number of unchanged observations required before a reply is complete. */
  stablePolls?: number
}

export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
  cdpUrl: z.string().min(1).default(DEFAULT_CDP_URL),
  chatUrl: z.string().min(1).default(DEFAULT_CHAT_URL),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS),
  pollIntervalMs: z.number().default(DEFAULT_POLL_INTERVAL_MS),
  stablePolls: z.number().step(1).min(1).default(DEFAULT_STABLE_POLLS),
})

type ResolvedConfig = Required<Config>

function positiveTimer(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_TIMER_DELAY_MS) {
    throw new Error(`subagent-doubao-desktop: ${name} must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`)
  }
}

/** Preserve the exact text-only delegated brief. */
export function textTask(prompt: readonly ContentBlock[]): string {
  if (prompt.length === 0 || prompt.some(block => block.type !== 'text')) {
    throw new Error('subagent-doubao-desktop: the one-shot task must contain only text blocks')
  }
  const text = prompt.map(block => (block as Extract<ContentBlock, { type: 'text' }>).text).join('')
  if (text.trim().length === 0) throw new Error('subagent-doubao-desktop: the one-shot task must not be empty')
  return text
}

function diagnostic(stage: 'connect' | 'chat', error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const category = message.includes('unavailable') || message.includes('WebSocket')
    ? 'connection'
    : message.includes('composer') || message.includes('chat page')
      ? 'desktop-ui'
      : message.toLowerCase().includes('abort') || message.toLowerCase().includes('timeout')
        ? 'timeout'
        : 'unknown'
  return `Product subagent failure (product: Doubao Desktop; stage: ${stage}; category: ${category})`
}

class DoubaoDesktopProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false
  readonly backendModels = ['current'] as const
  readonly backendModelDefault = 'current'
  private busy = false

  constructor(
    readonly name: string,
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
  ) {}

  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    const prompt = textTask(request.prompt)
    if (request.signal.aborted) throw new Error('subagent-doubao-desktop: request was aborted before CDP startup')
    if (this.busy) throw new Error('subagent-doubao-desktop: the visible Doubao Desktop chat is already serving another delegation')
    this.busy = true

    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort(new Error(`Doubao Desktop delegation timed out after ${this.config.timeoutMs}ms`))
    }, this.config.timeoutMs)
    const onAbort = (): void => {
      controller.abort(request.signal.reason ?? new Error('Doubao Desktop delegation aborted'))
    }
    request.signal.addEventListener('abort', onAbort, { once: true })
    let client: CdpConnection
    try {
      client = await openDoubao({
        cdpUrl: this.config.cdpUrl,
        chatUrl: this.config.chatUrl,
        signal: controller.signal,
      })
    } catch (error: unknown) {
      clearTimeout(timeout)
      request.signal.removeEventListener('abort', onAbort)
      this.busy = false
      this.ctx.logger.warn(`subagent-doubao-desktop "${this.name}": start failed: %o`, error)
      throw new Error(
        `${diagnostic('connect', error)}. Close Doubao Desktop and restart it with --remote-debugging-port=9225, then open a chat window.`,
        { cause: error },
      )
    }

    let finalized = false
    const finalize = (): void => {
      if (finalized) return
      finalized = true
      clearTimeout(timeout)
      request.signal.removeEventListener('abort', onAbort)
      client.close()
      this.busy = false
    }
    const result: Promise<SubagentResult> = runDoubao({
      client,
      prompt,
      pollIntervalMs: this.config.pollIntervalMs,
      stablePolls: this.config.stablePolls,
      signal: controller.signal,
    }).then((answer): SubagentResult => ({
      output: [{ type: 'text', text: answer }],
      stopReason: 'completed',
    })).catch((error: unknown): SubagentResult => {
      this.ctx.logger.warn(`subagent-doubao-desktop "${this.name}": run failed: %o`, error)
      return {
        output: [],
        stopReason: controller.signal.aborted ? 'aborted' : 'error',
        diagnostic: diagnostic('chat', error),
      }
    }).finally(finalize)

    return {
      id: brandString<SessionId>(randomUUID()),
      localAgent: undefined,
      result,
      async dispose(): Promise<void> {
        if (!controller.signal.aborted) controller.abort(new Error('Doubao Desktop delegation disposed'))
        await result
        finalize()
      },
    }
  }
}

export function apply(ctx: Context, config: Config): void {
  const resolved = config as ResolvedConfig
  positiveTimer('timeoutMs', resolved.timeoutMs)
  positiveTimer('pollIntervalMs', resolved.pollIntervalMs)
  if (!Number.isSafeInteger(resolved.stablePolls) || resolved.stablePolls < 1) {
    throw new Error('subagent-doubao-desktop: stablePolls must be a positive safe integer')
  }
  ctx.subagents.registerProvider(new DoubaoDesktopProvider(resolved.providerName, ctx, resolved))
}
