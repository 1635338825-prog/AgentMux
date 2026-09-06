---
description: "The one-shot Doubao Desktop subagent provider: visible chat automation through a user-enabled local CDP endpoint."
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-doubao-desktop

English | [中文](README.zh.md)

## Summary

`dsh-subagent-doubao-desktop` lets a Harness agent delegate one text task to the signed-in Doubao Desktop application without an Ark API key. It attaches to a Chrome DevTools Protocol endpoint that the user explicitly enables, opens a fresh visible Doubao chat, submits the brief through the page composer, waits for a stable reply, and returns that text through `ctx.subagents`.

This is an unofficial compatibility bridge, not a Doubao public API. It does not read account passwords or copy browser cookies, but every delegated prompt is sent to Doubao and remains visible in the desktop account's conversation history.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Dev Note](#dev-note)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

Close every Doubao Desktop window, then start its real executable with a loopback-only debugging port:

```powershell
& 'C:\Path\To\Doubao.exe' --remote-debugging-port=9225
```

Keep the window open and signed in. Install the provider above an existing `ctx.subagents` service, then point a delegation tool at it:

```yaml
- name: '@deepseek-ai/dsh-subagent-doubao-desktop'
  config:
    cdpUrl: http://127.0.0.1:9225
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: doubao-desktop
    toolName: subagent_doubao
    maxDepth: provider-managed
```

The shipped `multi-agent` profile already contains those rows. It never terminates or relaunches Doubao automatically. If the application is already running without CDP, the delegation fails with restart instructions instead of changing desktop state.

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `doubao-desktop` | Registry name on `ctx.subagents` |
| `cdpUrl` | `http://127.0.0.1:9225` | User-enabled loopback CDP endpoint |
| `chatUrl` | `https://www.doubao.com/chat` | Fresh chat page used per delegation |
| `timeoutMs` | `180000` | Whole connection and reply deadline |
| `pollIntervalMs` | `2000` | Reply observation interval |
| `stablePolls` | `2` | Unchanged observations required for completion |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The provider uses Node's built-in Fetch and WebSocket implementations, so it adds no browser automation runtime. It discovers only `page` targets whose URL belongs to `doubao.com`, connects to that renderer, brings it to the foreground, and manipulates the visible composer through CDP runtime evaluation and key events. Reply collection follows Doubao's virtualized message rows and strips suggestion and action controls before returning text.

Only one run may own the visible desktop chat at a time. Cancellation disconnects the bridge, never closes the Doubao process. Errors cross the subagent boundary as fixed stage and category facts; detailed causes stay in Host logs.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider registration, one-shot lifecycle, cancellation, and diagnostics |
| [`src/cdp.ts`](src/cdp.ts) | CDP transport, target validation, composer input, and stable reply collection |
| [`tests/subagent-doubao-desktop.spec.ts`](tests/subagent-doubao-desktop.spec.ts) | Target, prompt-quoting, selector, and task-shape checks |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Subagent package map](../README.md) — provider and delegation-tool roles.
- [Multi-agent browser profile](../../bundle/multi-agent-app/README.md) — the ready-made composition that enables this provider.

-----

<a id="dev-note"></a>
## Dev Note

See the [multi-agent browser profile decision](../../../.agents/notes/implemented/feature/2026-09-04-multi-agent-browser-profile.md).

<a id="model-experience"></a>
## Model Experience

### Child request

#### What the model sees

Doubao receives the complete delegated brief in a fresh desktop conversation and does not see the parent transcript, workspace, or Harness tools. The selected backend is the model currently visible in the desktop application.

#### Token effect

Harness cannot observe Doubao Desktop token accounting. The parent pays only for the delegated brief in its tool call and the final reply returned as a tool result.

#### KV Cache effect

Each request opens a fresh Doubao conversation, so no provider-side prefix reuse is assumed. The parent tool result is appended after its reusable request prefix.

### Parent scheduling and results, indirectly

#### What the model sees

Through `dsh-tool-subagent`, the parent sees a one-shot `subagent_doubao` tool and receives only the final visible Doubao reply or a fixed failure diagnostic. Desktop DOM details, account state, and intermediate UI changes are not copied into the parent Session.

#### Token effect

The parent context grows by the delegated brief and the returned answer or failure; Harness cannot observe Doubao Desktop's own accounting.

#### KV Cache effect

Append-only: the returned tool result follows the reusable parent prefix and does not rewrite earlier messages.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Unofficial UI contract** — a Doubao release can change renderer URLs, DOM classes, or composer behavior and require selector maintenance.
- **Visible single-user surface** — concurrent Doubao delegations are rejected; the bridge brings the chat to the foreground and changes the visible conversation.
- **Text-only one-shot output** — file upload, images, citations, progress, continuation, and native tool traces are not returned.
- **User-enabled debugging** — CDP can inspect the signed-in renderer. Keep the port on loopback, do not expose it through a firewall or proxy, and close/restart Doubao normally when the bridge is not needed.
