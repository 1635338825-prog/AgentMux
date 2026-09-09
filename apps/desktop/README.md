---
description: "The AgentMux Windows desktop application for controlling multiple Agent tools."
kind: "package-reference"
---

# AgentMux Desktop

English | [中文](README.zh.md)

AgentMux Desktop is a native Electron application. Electron owns the application process, native window, single-instance lifecycle, navigation policy, and Harness child process; Microsoft Edge is no longer launched. The browser edition at `http://127.0.0.1:3080/` remains available and shares the same DeepSeek Harness-based backend, session memory, Agent routing, and model selections.

Run it from the repository with `pnpm desktop`. If Harness is not running, Electron starts the `multi-agent` profile with its embedded Node-compatible runtime and stops that owned process when the app quits. If Harness is already running, Electron validates and reuses the current user-protected authentication handoff.

External links open in the system browser, while the AgentMux workspace remains inside the native window. Renderer Node integration is disabled, context isolation and sandboxing are enabled, and navigation is restricted to the authenticated loopback service. API keys are never written by the desktop shell.

## Build and install the Windows application

Build the Electron NSIS installer with:

```sh
pnpm desktop:package
```

The command writes `AgentMux-Setup.exe` under `apps/desktop/dist`. The installer places AgentMux in the selected Windows application directory, creates Desktop and Start Menu shortcuts, registers an uninstaller, and can launch AgentMux when setup finishes.

The Electron Builder metadata targets this repository's GitHub Releases. Automatic in-app installation remains disabled until signed release artifacts and a stable update channel are available.

## Model Experience

### Desktop shell, indirectly

#### What the model sees

The desktop shell adds no model instructions or tools. It displays the same multi-agent session surface as the browser edition, including the coordinator model, Agent selection policy, and each selected product model. Those shared packages, rather than the shell, construct the model request.

#### Token effect

None beyond the shared Harness session. The shell does not call a model itself.

#### KV Cache effect

None. Prompt construction remains owned by the shared Web and Host packages.

## Known Limitations and Deferred Work

- The generated installer is unsigned. Production distribution still requires an Authenticode certificate and a trusted HTTPS release origin.
- This first Electron build still starts the Harness backend from the remembered built AgentMux repository. Bundling and pruning the complete Harness runtime is the next packaging milestone.
- Codex, Claude Code, Doubao Desktop, and Qwen still require their respective local applications or CLIs when selected.
- The desktop and browser surfaces intentionally share features and backend state; this is not a second UI implementation.
