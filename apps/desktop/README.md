---
description: "The AgentMux Windows desktop application for controlling multiple Agent tools."
kind: "package-reference"
---

# AgentMux Desktop

English | [中文](README.zh.md)

AgentMux Desktop is a native Electron application. Electron owns the application process, native window, single-instance lifecycle, navigation policy, and Harness child process; Microsoft Edge is no longer launched. The browser edition at `http://127.0.0.1:3080/` remains available and shares the same DeepSeek Harness-based backend, session memory, Agent routing, and model selections.

Run it from the repository with `pnpm desktop`. The packaged application starts the `multi-agent` profile from `resources/runtime`, a generated and pruned production dependency closure embedded in the installer, and stops that owned process when the app quits. It does not need the AgentMux source checkout, Node.js, or pnpm on the destination computer. If Harness is already running, Electron validates and reuses the current user-protected authentication handoff.

External links open in the system browser, while the AgentMux workspace remains inside the native window. Renderer Node integration is disabled, context isolation and sandboxing are enabled, and navigation is restricted to the authenticated loopback service. API keys are never written by the desktop shell.

## Build and install the Windows application

Build the Electron NSIS installer with:

```sh
pnpm desktop:package
```

The command regenerates the standalone runtime, prunes development-only files, and writes `AgentMux-Setup.exe` under `apps/desktop/dist`. The installer places AgentMux and its runtime in the selected Windows application directory, creates Desktop and Start Menu shortcuts, registers an uninstaller, and can launch AgentMux when setup finishes. The compressed installer is substantially larger than the thin desktop preview because it carries the complete local backend.

The Electron Builder metadata targets this repository's GitHub Releases. Packaged builds check that channel after startup and every six hours. AgentMux asks before downloading an update and again before restarting to install it; choosing not to restart installs the downloaded update when the application exits.

Push a tag matching `agentmux-v<desktop package version>` to run the Windows release workflow. It builds the complete standalone installer, generates `latest.yml`, the differential-download blockmap, and SHA-256 checksums, then creates the corresponding GitHub Release. If repository secrets `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` contain a base64-encoded Authenticode PFX and its password, Electron Builder signs the installer automatically. Releases remain unsigned when those secrets are absent.

## Model Experience

### Desktop shell, indirectly

#### What the model sees

The desktop shell adds no model instructions or tools. It displays the same multi-agent session surface as the browser edition, including the coordinator model, Agent selection policy, and each selected product model. Those shared packages, rather than the shell, construct the model request.

#### Token effect

None beyond the shared Harness session. The shell does not call a model itself.

#### KV Cache effect

None. Prompt construction remains owned by the shared Web and Host packages.

## Known Limitations and Deferred Work

- Builds are unsigned until a trusted Authenticode PFX is added through the release secrets described above. Unsigned installers can trigger a Windows reputation warning; auto-update metadata still verifies the downloaded file hash, but publisher identity verification requires signing.
- Provider accounts and credentials remain user-owned and are not bundled. Codex and Claude runtime binaries are carried by their pinned official SDK packages; Doubao Desktop and Qwen integrations still require their respective local product or CLI when selected.
- The desktop and browser surfaces intentionally share features and backend state; this is not a second UI implementation.
