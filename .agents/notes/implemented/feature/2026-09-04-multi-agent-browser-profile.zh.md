# Agent Note: 交付多 Agent 浏览器 profile

Status: implemented

[English](2026-09-04-multi-agent-browser-profile.md) | 中文

本决策扩展了 [Claude Code 与 Codex subagent 后端](2026-08-04-claude-code-and-codex-subagent-backends.zh.md)中的显式产品 provider 安装边界。该记录继续负责各 provider 的协议、生命周期、诊断、权限行为与证据；没有活跃 Agent Note 被完全取代或符合归档条件。

## Problem

Web 应用可以承载本地、Codex 与 Claude Code subagent provider，但随附的 `web` profile 只安装本地 provider，并且每个随附 preset 都禁用两个产品工具。目标控制表层还需要使用已登录的豆包桌面产品，而不是方舟 API Key；豆包没有为这个反向控制场景公布受支持的外部 Agent 协议。否则，用户必须独立组装 profile 安装、provider 注册、preset 授权和桌面兼容桥。

## Decision

Launcher 随附 `multi-agent` profile 模板，由 `dsh-base`、`dsh-web-app` 与 `dsh-multi-agent-app` 组成。最后一个 bundle 选择随附的 `multi-agent` preset，并在 Host 平面注册官方 Codex、Claude Code provider 与豆包桌面 provider。其依赖闭包携带三个 provider 包；普通 `web` profile 保持不变。

`multi-agent` preset 暴露本地 spawn 与 fork 委派、三个具名产品委派工具、后台 Job 控制和 workflow 引擎。其 persona 让 DeepSeek 父 Agent 担任协调者：委派会收到有边界、可独立理解的任务说明；相互独立的工作同时启动；重要结论接受独立复核或直接证据检查；分歧通过可复现的 workspace 事实解决；用户得到一份综合结论，而不是原始 transcript。

豆包桌面版是显式兼容边界。Provider 只连接用户开启的回环 CDP 端口，选择 `doubao.com` 页面 target，打开全新可见聊天，通过输入框发送文本任务，等待虚拟化消息行内容稳定，并只返回最终文本。它绝不读取账号凭据、复制 Cookie，也不自动终止或重启桌面进程。同一时间只允许一次可见运行；取消会断开桥接。由于豆包没有为此用途公布受支持的外部协议，DOM 与渲染器变化被明确接受为维护风险。

Provider 存在性与模型权限继续分离。Host bundle 注册 provider，按会话的 preset 授予工具。Codex 与 Claude Code 保留原生登录、设置、模型选择和权限行为；profile 启动或 preset 组装都不会启动任一产品。

## Verification

包测试通过生产 entry-list schema 解析 bundle patch，并固定其 provider 依赖闭包。Preset 测试固定随附名单与已启用的委派行。豆包包测试覆盖 target 选择、提示词引用、选择器构建和仅文本任务校验。真实 Loader 组合测试在三个产品 provider 均存在时挂载随附 preset，观察本地、Codex、Claude Code、豆包、Job 和 workflow 工具，并证明组合过程不会启动产品子进程。

## Alternatives considered

**在 standard preset 中启用产品行。** 不采用，因为把 provider 安装进普通 Web 部署会悄然向每个 standard 会话授予新的模型可见能力。独立 profile 让更大的依赖与权限表层保持显式。

**在 `ctx.subagents` 之上新建编排 runtime。** 不采用，因为现有 registry、委派工具、Job 表层与 workflow 引擎已经负责执行、取消和组合。在进度流或可恢复产品会话确实要求新 seam 之前，再建 runtime 会重复这些契约。

**把产品选择加入父工具 schema。** 不采用，因为不同工具名能直接显示 provider 可用性、保持 schema 稳定，并允许 preset 独立授予每个目标。

**为豆包使用方舟 API。** 不采用，因为本 profile 要使用的身份与权益是已登录桌面产品。API 路由需要另外的凭据、计费和模型配置，也无法证明实际使用了桌面应用。

**自动终止并以 CDP 重启豆包。** 不采用，因为 provider 启动不得破坏尚未发送的桌面状态。连接设置保持为用户显式操作，端口缺失时带可执行说明关闭失败。

## Consequences

一条命令即可打开浏览器会话，让协调者无需编辑 profile 或 preset 文件便能使用本地子级和三个具名产品目标。普通 Web 产品保持较小的依赖闭包与权限表层。该 profile 会承担两个官方 CLI 产品发行版的安装体积；它们的委派仍会启动新进程、使用独立上下文。豆包不增加 API 凭据或浏览器运行时，但要求用户显式开启调试的可见桌面会话，并且会串行处理工作、在用户账号历史中保留对话，还可能在产品更新后需要维护。产品原生进度、审批、续接、结构化 diff 和统一用量核算仍不属于这套组合。
