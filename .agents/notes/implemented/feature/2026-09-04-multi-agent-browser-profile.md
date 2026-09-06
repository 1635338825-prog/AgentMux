# Agent Note: Ship a multi-agent browser profile

Status: implemented

English | [中文](2026-09-04-multi-agent-browser-profile.zh.md)

This decision extends the explicit product-provider installation boundary in [Claude Code and Codex subagent backends](2026-08-04-claude-code-and-codex-subagent-backends.md). That record continues to own each provider's protocol, lifecycle, diagnostics, permission behavior, and evidence; no active Agent Note is fully superseded or eligible for archival.

## Problem

The Web app can host local, Codex, and Claude Code subagent providers, but the shipped `web` profile installs only local providers and every shipped preset disables both product tools. The desired control surface also needs the signed-in Doubao Desktop product without requiring an Ark API key. Doubao exposes no supported external agent protocol for this direction of control. A user would otherwise need to assemble profile installation, provider registration, preset grants, and a desktop compatibility bridge independently.

## Decision

The launcher ships a `multi-agent` profile template composed from `dsh-base`, `dsh-web-app`, and `dsh-multi-agent-app`. The final bundle selects the shipped `multi-agent` preset and registers the official Codex and Claude Code providers plus a Doubao Desktop provider on the Host plane. Its dependency closure carries all three provider packages; the ordinary `web` profile remains unchanged.

The `multi-agent` preset exposes local spawn and fork delegation, three named product delegation tools, background Job controls, and the workflow engine. Its persona makes the parent DeepSeek agent the coordinator: delegations receive bounded self-contained briefs, independent work starts together, consequential claims receive independent review or direct evidence, disagreements resolve through reproducible workspace facts, and the user receives one synthesis rather than raw transcripts.

Doubao Desktop is an explicit compatibility boundary. The provider connects only to a user-enabled loopback CDP endpoint, selects a `doubao.com` page target, opens a fresh visible chat, sends a text brief through the composer, waits for stable virtualized-row content, and returns only final text. It never reads account credentials, copies cookies, or automatically kills or relaunches the desktop process. One visible run is allowed at a time; cancellation disconnects the bridge. Because Doubao publishes no supported external protocol for this use, DOM and renderer changes are accepted maintenance risk and are documented as such.

Provider presence and model authority remain separate. The Host bundle registers providers, while the per-session preset grants tools. Codex and Claude Code retain native login, settings, model selection, and permission behavior; neither product starts during profile boot or preset composition.

## Verification

Package tests parse the bundle patch through the production entry-list schema and pin its provider dependency closure. Preset tests pin the shipped roster and enabled delegation rows. The Doubao package tests target selection, prompt quoting, selector construction, and text-only task validation. A real Loader composition test mounts the shipped preset with all three product providers, observes the local, Codex, Claude Code, Doubao, Job, and workflow tools, and proves composition starts no product subprocess.

## Alternatives considered

**Enable product rows in the standard preset.** Rejected because installing a provider into an ordinary Web deployment would silently grant every standard session a new model-facing capability. A dedicated profile makes the larger dependency and authority surface explicit.

**Create a new orchestration runtime above `ctx.subagents`.** Rejected because the existing registry, delegation tools, Job surface, and workflow engine already own execution, cancellation, and composition. Another runtime would duplicate those contracts before progress streaming or resumable product sessions require a new seam.

**Add product selection to the parent tool schema.** Rejected because distinct tool names keep provider availability visible, preserve stable schemas, and let presets grant each target independently.

**Use the Ark API for Doubao.** Rejected because the requested identity and entitlement are the signed-in desktop product. An API route would require separate credentials, billing, and model configuration and would not prove that the desktop application was used.

**Automatically terminate and relaunch Doubao with CDP.** Rejected because a provider start must not destroy unsent desktop state. Connection setup remains an explicit user action and a missing port fails closed with actionable instructions.

## Consequences

One command opens a browser session whose coordinator can use local children and three named product targets without editing profile or preset files. The regular Web product keeps its smaller dependency closure and authority surface. The profile pays the installation size of both official CLI distributions; their delegations still pay for a fresh process and independent context. Doubao adds no API credential or browser runtime, but it requires an explicitly debug-enabled visible desktop session, serializes work, leaves conversations in the user's account history, and can require maintenance after product updates. Product-native progress, approvals, continuation, structured diffs, and unified usage accounting remain outside this composition.
