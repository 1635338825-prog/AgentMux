---
description: "The one-shot Qwen subagent provider over an authenticated Bailian CLI installation."
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-qwen

English | [中文](README.zh.md)

## Summary

`dsh-subagent-qwen` lets a Harness coordinator delegate a text task to a Qwen model through the locally authenticated Alibaba Cloud Bailian CLI. The provider starts a managed `bl text chat` process, sends the brief over standard input, parses its JSON answer, and returns only the assistant text through `ctx.subagents`.

## Use this package

Install and authenticate `bl` first. Then mount the provider and its model-facing tool:

```yaml
- name: '@deepseek-ai/dsh-subagent-qwen'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: qwen
    toolName: subagent_qwen
    maxDepth: provider-managed
```

The shipped `multi-agent` profile already includes this composition. Its browser Agent selector can enable Qwen and choose one of the provider-advertised model ids; the selected value crosses the tool boundary as `backend_model`.

| Field | Default | Meaning |
|---|---|---|
| `providerName` | `qwen` | Registry name on `ctx.subagents` |
| `model` | `qwen3.8-max` | Default Bailian model |
| `models` | Qwen model list | Models exposed to the browser selector |
| `command` | Windows: Volta executable; others: `bl` | Executable used to launch the installed CLI |
| `commandArgs` | Windows: `run bl`; others: none | Arguments inserted before `text chat` |
| `timeoutMs` | `180000` | Whole request deadline |

## Dev Note

See the [multi-agent browser profile decision](../../../.agents/notes/implemented/feature/2026-09-04-multi-agent-browser-profile.md).

## Model Experience

### Child request

#### What the model sees

Qwen receives one self-contained text brief, the provider's short system instruction, the selected `backend_model`, and no parent transcript or Harness tools. Authentication remains in the user's Bailian CLI profile and is not copied into repository configuration.

#### Token effect

The Qwen child pays for an independent Bailian request. Child tokens do not enter the parent's context.

#### KV Cache effect

Each invocation is a fresh `bl text chat` request, so the provider assumes no reusable conversation prefix.

### Parent scheduling and results, indirectly

#### What the model sees

Through `dsh-tool-subagent`, the parent sees a one-shot `subagent_qwen` tool with an optional `backend_model` parameter and receives either the final assistant text or a fixed failure diagnostic. Qwen reasoning, raw CLI output, credentials, and usage are not copied into the parent Session.

#### Token effect

The parent context grows by the delegated brief and returned answer or failure. Bailian usage is accounted independently by the selected Qwen model.

#### KV Cache effect

Append-only: the Qwen tool result is added after the reusable parent prefix and does not rewrite earlier messages.

## Known Limitations and Deferred Work

- **Text-only one-shot flow** — continuations, files, images, tool traces, and streaming progress are not returned.
- **CLI installation dependency** — the default launch command matches the current Volta installation; other installations can configure `command` and `commandArgs`.
- **Catalog is deployment-owned** — administrators must keep `models` aligned with model ids enabled in their Bailian workspace.
