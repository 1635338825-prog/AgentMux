---
description: "The multi-agent browser profile layer: a DeepSeek coordinator with local, Codex, Claude Code, Doubao Desktop, and Qwen delegation targets."
kind: "package-bundle"
---

# @deepseek-ai/dsh-multi-agent-app

English | [中文](README.zh.md)

## Summary

`dsh-multi-agent-app` turns the browser app into an orchestration surface. It selects the shipped `multi-agent` preset and registers the official Codex and Claude Code one-shot providers, the local Doubao Desktop bridge, and Qwen through the authenticated Bailian CLI beside the continuable subagent providers from `dsh-base`. The parent DeepSeek agent can split work, start independent delegates together, compare evidence, and return one synthesized answer.

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

Start the ready-made browser profile from the workspace you want the agents to use:

```sh
dsh --profile multi-agent
```

The profile opens the same Web application as `dsh web`, with `multi-agent` selected for new sessions. Its tool set contains local `subagent` and `subagent_fork` targets, `subagent_codex`, `subagent_claude_code`, `subagent_doubao`, `subagent_qwen`, background-job controls, and the workflow tool. The model menu also exposes an Agent selector; Codex, Claude Code, and Qwen can each use a selected backend model, while Doubao uses the model currently visible in its desktop app.

Codex and Claude Code keep their native account and project settings. This bundle does not copy credentials, perform login, choose a product model, or start either product until the parent calls its tool. A missing or unusable native login becomes that delegation's explicit failure while the rest of the browser session remains available.

Doubao uses the signed-in desktop application instead of an Ark API key. Completely close Doubao and restart its executable with `--remote-debugging-port=9225`, then keep a chat window open. The bridge creates a visible conversation for each delegation and never kills or relaunches the application automatically.

Qwen uses the locally authenticated Bailian CLI. Its provider invokes `bl text chat`, keeps credentials in the CLI profile, and forwards the browser's Qwen model choice through the tool's `backend_model` argument.

For one-shot product work, omit `run_in_background` when the coordinator needs the answer before continuing. Set it to `true` to receive a generic Job id and collect the result later with `job_output`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle is a static patch applied after `dsh-base` and `dsh-web-app`. It changes the complete `agent-presets` config to select `multi-agent`, then inserts the Codex, Claude Code, Doubao Desktop, and Qwen providers on the Host plane. The preset separately grants their model-facing tools, so provider availability and agent authority remain distinct.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Profile default and Host-plane provider rows |
| [`src/index.ts`](src/index.ts) | Package entry; carries no runtime API |
| [`tests/multi-agent-app.spec.ts`](tests/multi-agent-app.spec.ts) | Manifest, dependency, and patch-shape checks |
| — | No runtime invariant companion is published; the bundle owns only a static patch list. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Subagent package map](../../subagent/README.md) — provider and delegation-tool roles.
- [Agent presets](../../preset/agent-presets/README.md) — per-session composition and preset selection.
- [Multi-agent browser profile decision](../../../.agents/notes/implemented/feature/2026-09-04-multi-agent-browser-profile.md) — rationale and trade-offs.

-----

<a id="dev-note"></a>
## Dev Note

None.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the selected multi-agent preset and each provider or tool package, which own their model-facing behavior.

#### KV Cache effect

The bundle itself adds no request prefix; the selected preset and its tool packages own any cache effect.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Product delegates are one-shot** — Codex, Claude Code, Doubao, and Qwen return final text or a generic background Job result; their intermediate reasoning, tool activity, diffs, and usage are not streamed into the parent session.
- **Native product interaction stays unattended** — a product request that requires a human approval or question fails closed rather than opening a second approval channel in the Web app.
- **Doubao is a visible compatibility bridge** — it relies on an explicitly enabled local CDP port and the current desktop DOM, supports one text task at a time, and may need maintenance after a Doubao update.
- **Qwen depends on the Bailian CLI** — the local CLI must stay installed, authenticated, and aligned with the model ids enabled in the configured workspace.
