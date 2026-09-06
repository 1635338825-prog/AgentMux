/** One-shot Qwen subagent provider over the authenticated Bailian CLI. */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import {
  NO_START_CAPABILITIES,
  assertPositiveFinite,
  resolveChildCwd,
  type ResolvedSubagentStartRequest,
  type SubagentCapabilities,
  type SubagentProvider,
  type SubagentResult,
  type SubagentRun,
} from '@deepseek-ai/dsh-subagent'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'

export const name = 'subagent-qwen'
export const inject = ['subagents', 'subprocess']

const DEFAULT_PROVIDER_NAME = 'qwen'
const DEFAULT_MODEL = 'qwen3.8-max'
const DEFAULT_MODELS = ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus'] as const
const DEFAULT_COMMAND = process.platform === 'win32' ? 'C:\\Program Files\\Volta\\volta.exe' : 'bl'
const DEFAULT_COMMAND_ARGS = process.platform === 'win32' ? ['run', 'bl'] as const : [] as const
const DEFAULT_TIMEOUT_MS = 180_000
const DEFAULT_DISPOSE_GRACE_MS = 3_000
const DEFAULT_MAX_TOKENS = 4_096
const MAX_STDOUT_BYTES = 1_048_576
const MAX_STDERR_BYTES = 65_536

export interface Config {
  providerName?: string
  /** Bailian model used unless a tool call selects another advertised model. */
  model?: string
  /** Bailian model ids exposed to the browser Agent selector. */
  models?: string[]
  /** Executable used to start the CLI. The Windows preset uses Volta's executable. */
  command?: string
  /** Prefix before `text chat`; defaults to `run bl` for the Volta installation. */
  commandArgs?: string[]
  env?: Record<string, string>
  systemPrompt?: string
  maxTokens?: number
  timeoutMs?: number
  disposeGraceMs?: number
}

export const Config: z<Config> = z.object({
  providerName: z.string().min(1).default(DEFAULT_PROVIDER_NAME),
  model: z.string().min(1).default(DEFAULT_MODEL),
  models: z.array(z.string().min(1)).default([...DEFAULT_MODELS]),
  command: z.string().min(1).default(DEFAULT_COMMAND),
  commandArgs: z.array(z.string()).default([...DEFAULT_COMMAND_ARGS]),
  env: z.dict(z.string()).default({}),
  systemPrompt: z.string().default('Reply in the same language as the user. Be concise, evidence-oriented, and clearly state uncertainty.'),
  maxTokens: z.number().step(1).min(1).default(DEFAULT_MAX_TOKENS),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS),
  disposeGraceMs: z.number().default(DEFAULT_DISPOSE_GRACE_MS),
})

type ResolvedConfig = Required<Config>

/** Preserve one exact text-only delegated brief. */
export function textTask(prompt: readonly ContentBlock[]): string {
  if (prompt.length === 0 || prompt.some(block => block.type !== 'text')) {
    throw new Error('subagent-qwen: the one-shot task must contain only text blocks')
  }
  const text = prompt.map(block => (block as Extract<ContentBlock, { type: 'text' }>).text).join('')
  if (text.trim().length === 0) throw new Error('subagent-qwen: the one-shot task must not be empty')
  return text
}

interface BailianChatResponse {
  choices?: Array<{ message?: { content?: unknown } }>
}

/** Extract the assistant answer from `bl text chat --output json`. */
export function parseBailianAnswer(stdout: string): string {
  let payload: BailianChatResponse
  try {
    payload = JSON.parse(stdout) as BailianChatResponse
  } catch {
    throw new Error('subagent-qwen: Bailian CLI returned invalid JSON')
  }
  const content = payload.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('subagent-qwen: Bailian CLI returned no assistant text')
  }
  return content
}

function resultDiagnostic(stage: 'resolve' | 'chat'): string {
  return `Product subagent failure (product: Qwen via Bailian CLI; stage: ${stage})`
}

class QwenProvider implements SubagentProvider {
  readonly capabilities: SubagentCapabilities = NO_START_CAPABILITIES
  readonly inheritsParentContext = false

  constructor(
    readonly name: string,
    private readonly ctx: Context,
    private readonly config: ResolvedConfig,
  ) {}

  get backendModels(): readonly string[] {
    return this.config.models
  }

  get backendModelDefault(): string {
    return this.config.model
  }

  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    const prompt = textTask(request.prompt)
    const cwd = resolveChildCwd('subagent-qwen', undefined, request.parent.session.header.cwd)
    if (request.signal.aborted) throw new Error('subagent-qwen: request was aborted before CLI startup')

    let executable: string
    try {
      executable = await this.ctx.subprocess.resolveExecutable(this.config.command, this.config.env, request.signal)
    } catch (error: unknown) {
      this.ctx.logger.warn(`subagent-qwen "${this.name}": executable resolution failed: %o`, error)
      throw new Error(`${resultDiagnostic('resolve')}. Install and authenticate the Bailian CLI before using this Agent.`, { cause: error })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => { controller.abort(new Error('Qwen delegation timed out')) }, this.config.timeoutMs)
    const onAbort = (): void => { controller.abort(request.signal.reason ?? new Error('Qwen delegation aborted')) }
    request.signal.addEventListener('abort', onAbort, { once: true })
    const model = request.backendModel ?? this.config.model
    const messages = JSON.stringify([{ role: 'user', content: prompt }])
    let child: SubprocessHandle
    try {
      child = this.ctx.subprocess.spawn({
        argv: [
          executable,
          ...this.config.commandArgs,
          'text',
          'chat',
          '--model', model,
          '--system', this.config.systemPrompt,
          '--messages-file', '-',
          '--max-tokens', String(this.config.maxTokens),
          '--output', 'json',
          '--timeout', String(Math.ceil(this.config.timeoutMs / 1_000)),
        ],
        cwd,
        env: this.config.env,
        stdio: {
          stdin: { data: messages },
          stdout: { maxBytes: MAX_STDOUT_BYTES },
          stderr: { maxBytes: MAX_STDERR_BYTES },
        },
        graceMs: this.config.disposeGraceMs,
        signal: controller.signal,
      })
    } catch (error: unknown) {
      clearTimeout(timeout)
      request.signal.removeEventListener('abort', onAbort)
      throw error
    }

    const output = (): ContentBlock[] => []
    const result: Promise<SubagentResult> = child.done.then((outcome) => {
      if (controller.signal.aborted) return { output: output(), stopReason: 'aborted' } satisfies SubagentResult
      if (outcome.exitCode !== 0) throw new Error(`Bailian CLI exited with code ${outcome.exitCode ?? 'signal'}`)
      const stdout = child.collected.stdout?.readFrom(0).text ?? ''
      return {
        output: [{ type: 'text', text: parseBailianAnswer(stdout) }],
        stopReason: 'completed',
      } satisfies SubagentResult
    }).catch((error: unknown): SubagentResult => {
      this.ctx.logger.warn(`subagent-qwen "${this.name}": run failed: %o`, error)
      return {
        output: output(),
        stopReason: controller.signal.aborted ? 'aborted' : 'error',
        diagnostic: resultDiagnostic('chat'),
      }
    }).finally(() => {
      clearTimeout(timeout)
      request.signal.removeEventListener('abort', onAbort)
    })

    return {
      id: brandString<SessionId>(randomUUID()),
      localAgent: undefined,
      result,
      async dispose(): Promise<void> {
        if (!controller.signal.aborted) controller.abort(new Error('Qwen delegation disposed'))
        child.terminate()
        await result
        await child.waitForExit()
      },
    }
  }
}

export function apply(ctx: Context, config: Config): void {
  const resolved: ResolvedConfig = {
    providerName: config.providerName ?? DEFAULT_PROVIDER_NAME,
    model: config.model ?? DEFAULT_MODEL,
    models: config.models ?? [...DEFAULT_MODELS],
    command: config.command ?? DEFAULT_COMMAND,
    commandArgs: config.commandArgs ?? [...DEFAULT_COMMAND_ARGS],
    env: config.env ?? {},
    systemPrompt: config.systemPrompt ?? 'Reply in the same language as the user. Be concise, evidence-oriented, and clearly state uncertainty.',
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    disposeGraceMs: config.disposeGraceMs ?? DEFAULT_DISPOSE_GRACE_MS,
  }
  assertPositiveFinite('subagent-qwen', 'timeoutMs', resolved.timeoutMs)
  assertPositiveFinite('subagent-qwen', 'disposeGraceMs', resolved.disposeGraceMs)
  if (resolved.timeoutMs > MAX_TIMER_DELAY_MS || resolved.disposeGraceMs > MAX_TIMER_DELAY_MS) {
    throw new Error(`subagent-qwen: timer values must be no greater than ${MAX_TIMER_DELAY_MS}`)
  }
  if (!Number.isSafeInteger(resolved.maxTokens) || resolved.maxTokens < 1) {
    throw new Error('subagent-qwen: maxTokens must be a positive safe integer')
  }
  if (!resolved.models.includes(resolved.model)) resolved.models = [resolved.model, ...resolved.models]
  ctx.subagents.registerProvider(new QwenProvider(resolved.providerName, ctx, resolved))
}
