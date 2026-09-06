/** Minimal Chrome DevTools Protocol client for the visible Doubao Desktop UI. */

export const DEFAULT_CDP_URL = 'http://127.0.0.1:9225'
export const DEFAULT_CHAT_URL = 'https://www.doubao.com/chat'

const INPUT_SELECTORS = [
  'textarea[placeholder*="发消息"]',
  'textarea[placeholder*="消息"]',
  'textarea',
  '[contenteditable="true"]',
  '.semi-input-textarea',
] as const

export interface CdpTarget {
  readonly id: string
  readonly type: string
  readonly url: string
  readonly webSocketDebuggerUrl?: string
}

interface CdpEnvelope {
  readonly id?: number
  readonly result?: unknown
  readonly error?: { readonly code?: number; readonly message?: string }
}

interface RuntimeEvaluation {
  readonly result?: {
    readonly value?: unknown
    readonly description?: string
  }
  readonly exceptionDetails?: {
    readonly text?: string
  }
}

function endpoint(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${path}`
}

function thrown(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function abortError(signal: AbortSignal): Error {
  return thrown(signal.reason ?? new Error('Doubao Desktop operation aborted'))
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(abortError(signal))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Fetch and validate the page targets exposed by the user-enabled CDP port. */
export async function listCdpTargets(cdpUrl: string, signal: AbortSignal): Promise<CdpTarget[]> {
  let response: Response
  try {
    response = await fetch(endpoint(cdpUrl, '/json/list'), { signal })
  } catch (error: unknown) {
    throw new Error(`Doubao Desktop CDP is unavailable at ${cdpUrl}`, { cause: error })
  }
  if (!response.ok) {
    throw new Error(`Doubao Desktop CDP returned HTTP ${response.status} at ${cdpUrl}`)
  }
  const value: unknown = await response.json()
  if (!Array.isArray(value)) throw new Error('Doubao Desktop CDP returned an invalid target list')
  return value.flatMap((entry): CdpTarget[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const candidate = entry as Partial<CdpTarget>
    return typeof candidate.id === 'string'
      && typeof candidate.type === 'string'
      && typeof candidate.url === 'string'
      ? [{
        id: candidate.id,
        type: candidate.type,
        url: candidate.url,
        ...(typeof candidate.webSocketDebuggerUrl === 'string'
          ? { webSocketDebuggerUrl: candidate.webSocketDebuggerUrl }
          : {}),
      }]
      : []
  })
}

/** Prefer the visible Doubao chat renderer and reject unrelated CDP targets. */
export function selectDoubaoTarget(targets: readonly CdpTarget[]): CdpTarget {
  const pages = targets.filter(target => target.type === 'page' && target.webSocketDebuggerUrl !== undefined)
  const target = pages.find(page => page.url.startsWith('doubao://doubao-chat/chat'))
    ?? pages.find(page => page.url.includes('doubao.com/chat'))
    ?? pages.find(page => page.url.includes('doubao.com'))
  if (target === undefined) {
    throw new Error('Doubao Desktop CDP exposes no chat page; open the Doubao chat window and retry')
  }
  return target
}

/** A request/response CDP socket. Closing it disconnects the bridge only. */
export class CdpConnection {
  private nextId = 1
  private readonly pending = new Map<number, {
    readonly resolve: (value: unknown) => void
    readonly reject: (error: Error) => void
  }>()

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      let envelope: CdpEnvelope
      try {
        envelope = JSON.parse(String(event.data)) as CdpEnvelope
      } catch {
        return
      }
      if (envelope.id === undefined) return
      const waiter = this.pending.get(envelope.id)
      if (waiter === undefined) return
      this.pending.delete(envelope.id)
      if (envelope.error !== undefined) {
        waiter.reject(new Error(`CDP ${envelope.error.code ?? 'error'}: ${envelope.error.message ?? 'unknown error'}`))
      } else {
        waiter.resolve(envelope.result)
      }
    })
    const rejectPending = (): void => {
      for (const waiter of this.pending.values()) waiter.reject(new Error('Doubao Desktop CDP disconnected'))
      this.pending.clear()
    }
    socket.addEventListener('close', rejectPending)
    socket.addEventListener('error', rejectPending)
  }

  static connect(url: string, signal: AbortSignal): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError(signal))
        return
      }
      const socket = new WebSocket(url)
      const onAbort = (): void => {
        socket.close()
        reject(abortError(signal))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      socket.addEventListener('open', () => {
        signal.removeEventListener('abort', onAbort)
        resolve(new CdpConnection(socket))
      }, { once: true })
      socket.addEventListener('error', () => {
        signal.removeEventListener('abort', onAbort)
        reject(new Error('Doubao Desktop CDP WebSocket connection failed'))
      }, { once: true })
    })
  }

  request(method: string, params: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted === true) return Promise.reject(abortError(signal))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        this.pending.delete(id)
        reject(abortError(signal as AbortSignal))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener('abort', onAbort)
          resolve(value)
        },
        reject: (error) => {
          signal?.removeEventListener('abort', onAbort)
          reject(error)
        },
      })
      try {
        this.socket.send(JSON.stringify({ id, method, params }))
      } catch (error: unknown) {
        this.pending.delete(id)
        signal?.removeEventListener('abort', onAbort)
        reject(thrown(error))
      }
    })
  }

  async evaluate<T>(expression: string, signal?: AbortSignal): Promise<T> {
    const response = await this.request('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }, signal) as RuntimeEvaluation
    if (response.exceptionDetails !== undefined) {
      throw new Error(response.exceptionDetails.text ?? response.result?.description ?? 'Doubao page evaluation failed')
    }
    return response.result?.value as T
  }

  close(): void {
    this.socket.close()
  }
}

/** DOM expression used as a version-tolerant readiness probe. */
export function inputReadyExpression(): string {
  return `(() => {
    const selectors = ${JSON.stringify(INPUT_SELECTORS)};
    return selectors.some(selector => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = window.getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none';
    });
  })()`
}

/** DOM expression that fills the visible composer using native input events. */
export function fillPromptExpression(prompt: string): string {
  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const selectors = ${JSON.stringify(INPUT_SELECTORS)};
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const style = window.getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      element.focus();
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        const prototype = element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(element, prompt); else element.value = prompt;
      } else {
        element.textContent = prompt;
      }
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  })()`
}

/** DOM expression that returns the newest meaningful chat row without controls. */
export function lastMessageExpression(): string {
  return `(() => {
    const received = document.querySelectorAll('[data-testid="receive_message"]');
    if (received.length > 0) {
      const row = received[received.length - 1];
      const contents = row.querySelectorAll('[data-testid="message_text_content"]');
      for (let index = contents.length - 1; index >= 0; index -= 1) {
        const content = contents[index];
        if (content.getAttribute('data-streaming') === 'true') return null;
        const text = content.textContent?.trim();
        if (text) return text;
      }
      return null;
    }
    const container = document.querySelector('.list_items');
    if (!container) return null;
    const rows = container.querySelectorAll('.v_list_row');
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const text = rows[index].textContent?.trim();
      if (!text || text.length <= 5) continue;
      const clone = rows[index].cloneNode(true);
      for (const element of clone.querySelectorAll('[class*="suggest-message-list-wrapper"], [class*="message-action-bar"]')) {
        element.remove();
      }
      return clone.textContent?.trim() || null;
    }
    return null;
  })()`
}

async function waitForInput(client: CdpConnection, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    if (await client.evaluate<boolean>(inputReadyExpression(), signal)) return
    await delay(250, signal)
  }
  throw abortError(signal)
}

export interface OpenDoubaoOptions {
  readonly cdpUrl: string
  readonly chatUrl: string
  readonly signal: AbortSignal
}

/** Attach to the existing desktop renderer and prepare a fresh visible chat. */
export async function openDoubao(options: OpenDoubaoOptions): Promise<CdpConnection> {
  const target = selectDoubaoTarget(await listCdpTargets(options.cdpUrl, options.signal))
  const client = await CdpConnection.connect(target.webSocketDebuggerUrl as string, options.signal)
  try {
    await client.request('Runtime.enable', {}, options.signal)
    await client.request('Page.enable', {}, options.signal)
    await client.request('Page.bringToFront', {}, options.signal)
    const isNativeDesktopChat = target.url.startsWith('doubao://doubao-chat/chat')
    if (!isNativeDesktopChat && target.url !== options.chatUrl) {
      await client.request('Page.navigate', { url: options.chatUrl }, options.signal)
    }
    await waitForInput(client, options.signal)
    return client
  } catch (error: unknown) {
    client.close()
    throw error
  }
}

export interface RunDoubaoOptions {
  readonly client: CdpConnection
  readonly prompt: string
  readonly pollIntervalMs: number
  readonly stablePolls: number
  readonly signal: AbortSignal
}

/** Send one prompt through the visible composer and require a stable new reply. */
export async function runDoubao(options: RunDoubaoOptions): Promise<string> {
  const before = await options.client.evaluate<string | null>(lastMessageExpression(), options.signal) ?? ''
  const filled = await options.client.evaluate<boolean>(fillPromptExpression(options.prompt), options.signal)
  if (!filled) throw new Error('Doubao Desktop chat composer was not found')
  await options.client.request('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  }, options.signal)
  await options.client.request('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
  }, options.signal)

  let previous = ''
  let stable = 0
  while (!options.signal.aborted) {
    await delay(options.pollIntervalMs, options.signal)
    const current = await options.client.evaluate<string | null>(lastMessageExpression(), options.signal) ?? ''
    const meaningful = current.trim()
    if (meaningful.length === 0 || meaningful === before.trim() || meaningful === options.prompt.trim()) continue
    if (current === previous) {
      stable += 1
      if (stable >= options.stablePolls) return current
    } else {
      previous = current
      stable = 0
    }
  }
  throw abortError(options.signal)
}
