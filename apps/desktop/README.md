---
description: "The AgentMux Windows desktop application for controlling multiple Agent tools."
kind: "package-reference"
---

# AgentMux Desktop

English | [中文](README.zh.md)

AgentMux opens the existing multi-agent Web surface in a dedicated application window. It preserves the browser edition at `http://127.0.0.1:3080/`, shares the same DeepSeek Harness-based backend, session memory, and Agent features, and keeps a separate local window profile. When the Web service restarts, the shell reads its current user-protected runtime handoff instead of reopening a stale tokenized URL.

Run it from the repository with `pnpm desktop`. If the Harness server is not running, the shell starts the `multi-agent` profile and stops that owned server when the window closes. If the server is already running, it reuses it.

The first development run may pass the printed authenticated URL with `pnpm desktop -- --url <url>`. The short-lived launch URL is saved under the user's local application-data directory; API keys are never written by this shell.

## Build and install the Windows application

Build the portable application and installer with:

```sh
pnpm desktop:package
```

The command writes `AgentMux.exe`, `AgentMux-Setup.exe`, and `latest.json` under `apps/desktop/dist`. Run the Setup executable once from the built repository. It installs the application under the current user's local Programs directory, creates Desktop and Start Menu shortcuts, enables launch at sign-in, remembers the built project root, and opens the installed application. Pass `--no-startup` to Setup when launch at sign-in is not wanted.

Automatic updates are manifest-driven. Host `latest.json` and the matching Setup executable at the same HTTPS origin, then pass `--update-manifest https://example.com/path/latest.json` on the first Setup run. Later launches check that manifest, require a newer semantic version, verify the downloaded Setup SHA-256, replace the installed executable after the current process exits, and reopen the application. No update endpoint is enabled by default.

## Model Experience

### Desktop shell, indirectly

#### What the model sees

The desktop shell adds no model instructions or tools. It displays the same multi-agent session surface as the browser edition, including the coordinator model, Agent selection policy, and each selected product model. Those shared packages, rather than the shell, construct the model request.

#### Token effect

None beyond the shared Harness session. The shell does not call a model itself.

#### KV Cache effect

None. Prompt construction remains owned by the shared Web and Host packages.

## Known Limitations and Deferred Work

- Windows currently uses the installed Microsoft Edge application-mode runtime for its dedicated window.
- The generated installer is unsigned. Production distribution still requires an Authenticode certificate and a trusted HTTPS release origin.
- The packaged launcher contains its own Node runtime, but the current backend still starts from the remembered built repository and requires the product CLIs used by the selected Agents.
- A running server started outside the desktop shell must have been opened once with its authenticated launch URL in the desktop profile.
- The desktop and browser surfaces intentionally share features and backend state; this is not a second UI implementation.
