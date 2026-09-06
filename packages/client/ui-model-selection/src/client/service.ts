/**
 * ModelDirectoryResolver (`ctx.modelDirectories`): the root owner of per-session
 * {@link ModelDirectory} instances. Both selection entries (the /model popup
 * and the composer model seat) resolve their session's directory through
 * this service, which is what makes the dual entry one shared state.
 *
 * Per-session storage follows the client service pattern (InputTriggerService /
 * CommandUiRuntime): a lazy service-internal map whose entry is deleted by the
 * owning scope's disposer. The host `dsh-scope` ScopedLayers registry does
 * does not belong here: it derives scope from the host carrier mechanism
 * (object-keyed), while client scopes tag contexts with branded SessionId
 * strings, and it models global+shadow named registries — this is a
 * per-session singleton with no global layer to merge.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ModelCatalogDirectory } from './catalog.ts'
import { ModelDirectory } from './directory.ts'
import { writeAgentSelection, type AgentSelection } from './agent-selection.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    modelDirectories: ModelDirectoryResolver
  }
}

/** Live mutable state in one holder (service methods run behind the caller-ctx tracker). */
interface LiveState {
  /** Per-session directories; entries are deleted by their scope disposer. */
  readonly directories: Map<SessionId, ModelDirectory>
  readonly agentSelections: Map<SessionId, SnapshotStore<AgentSelection>>
}

/** The `ctx.modelDirectories` session model-selection service. */
export class ModelDirectoryResolver extends Service {
  static inject = ['sessions', 'remote', 'remote.session']

  private readonly live: LiveState = { directories: new Map(), agentSelections: new Map() }
  private readonly catalog: ModelCatalogDirectory

  /** Localized composer-block copy; this plugin owns the string it raises. */
  private readonly blockReason: () => string

  /**
   * @param ctx - owning root context (the service registers itself as `models`).
   * @param config - the bound translator for this plugin's own dictionary.
   */
  constructor(ctx: Context, config: { blockReason: () => string }) {
    super(ctx, 'modelDirectories')
    this.blockReason = config.blockReason
    this.catalog = new ModelCatalogDirectory(ctx)
    const submissions = ctx.get('conversation')?.submissions
    if (submissions !== undefined) {
      ctx.effect(() => submissions.register('ui-model-selection:agent-policy', (sessionId, text) => {
        const selection = this.live.agentSelections.get(sessionId)?.getSnapshot() ?? null
        return writeAgentSelection(text, selection)
      }), 'ui-model-selection: Agent submission policy')
    }
    void this.catalog.load().catch(() => { /* selectors expose the shared error */ })
    ctx.on('connection/reset', () => {
      this.catalog.resetGeneration()
      for (const directory of this.live.directories.values()) directory.resetConnected()
    })
    ctx.remote.$on('llm/adapters-updated', () => { this.catalog.refresh() })
    ctx.remote.$on('settings/document-updated', () => { this.catalog.refresh() })
    ctx.remote.$on('credentials/reference-updated', () => { this.catalog.refresh() })
  }

  /**
   * Resolve the per-session shared directory (lazy; the scope disposer
   * removes and disposes it). Unknown sessions fail loud.
   * @param sessionId - the owning session.
   * @returns the resident directory both entries share.
   */
  directoryFor(sessionId: SessionId): ModelDirectory {
    const { live } = this
    const existing = live.directories.get(sessionId)
    if (existing !== undefined) return existing
    const sessions = this.ctx.sessions
    const actx = sessions.scope(sessionId)
    if (actx === undefined) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no scope`)
    const binding = sessions.binding(sessionId)
    if (binding === undefined) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no binding`)
    const directory = new ModelDirectory(
      this.ctx.remote.session,
      sessionId,
      () => sessions.subagentAddress(sessionId) === undefined,
      this.catalog,
      binding.session.projections.faceOf('modelSelection'),
    )
    live.directories.set(sessionId, directory)
    // The composer cannot read this plugin (the dependency runs one way), so
    // the block is pushed: the Host says whether an adapter serves the
    // session's route, and only a definite `false` makes the input inert.
    // `null` — before the first load, or after one failed — must not, or a
    // slow or unreachable Host would lock a working composer.
    const conversation = this.ctx.get('conversation')
    if (conversation !== undefined) {
      const publish = (): void => {
        conversation.blocks.set(sessionId, directory.store.getSnapshot().routable === false
          ? { reason: this.blockReason() }
          : undefined)
      }
      publish()
      actx.effect(() => {
        const stop = directory.store.subscribe(publish)
        return () => {
          stop()
          conversation.blocks.set(sessionId, undefined)
        }
      }, 'ui-model-selection: composer block')
    }
    actx.effect(() => () => {
      directory.dispose()
      live.directories.delete(sessionId)
    }, 'ui-model-selection: session directory')
    return directory
  }

  /** Resolve the browser-only product-Agent policy for one session. */
  agentSelectionFor(sessionId: SessionId): SnapshotStore<AgentSelection> {
    const existing = this.live.agentSelections.get(sessionId)
    if (existing !== undefined) return existing
    const actx = this.ctx.sessions.scope(sessionId)
    if (actx === undefined) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no scope`)
    const binding = this.ctx.sessions.binding(sessionId)
    if (binding === undefined) throw new Error(`ui-model-selection: session "${String(sessionId)}" resolved no binding`)
    const projected = binding.session.projections.faceOf('agentSelection')
    const initial = projected.getSnapshot()
    const store = createSnapshotStore<AgentSelection>(initial === undefined ? null : initial as AgentSelection)
    this.live.agentSelections.set(sessionId, store)
    const stop = projected.subscribe(() => {
      const value = projected.getSnapshot()
      if (value !== undefined) store.set(value as AgentSelection)
    })
    actx.effect(() => () => {
      stop()
      this.live.agentSelections.delete(sessionId)
    }, 'ui-model-selection: Agent policy')
    return store
  }

  /** Persist one product-Agent routing policy through the Session event log. */
  async selectAgents(sessionId: SessionId, selection: AgentSelection): Promise<void> {
    const result = await this.ctx.remote.session.selectAgents({ sessionId, selection })
    if (!result.ok) throw new Error(`session.selectAgents failed: ${result.error.code}: ${result.error.message}`)
    this.agentSelectionFor(sessionId).set(result.value.selection)
  }
}
