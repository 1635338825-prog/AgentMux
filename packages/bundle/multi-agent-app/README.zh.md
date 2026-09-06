---
description: "多 Agent 浏览器 profile 层：由 DeepSeek 协调本地、Codex、Claude Code、豆包桌面版与千问委派目标。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-multi-agent-app

[English](README.md) | 中文

## 概述

`dsh-multi-agent-app` 把浏览器应用变成编排表层。它选择随附的 `multi-agent` preset，并在 `dsh-base` 的本地可持续子代理旁，注册官方 Codex、Claude Code 一次性 provider、本地豆包桌面桥，以及通过已鉴权百炼 CLI 调用的千问。DeepSeek 主 Agent 可以拆分工作、同时启动相互独立的委派、比较证据，并返回一份汇总答案。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用本包

在希望 Agent 使用的 workspace 中启动现成的浏览器 profile：

```sh
dsh --profile multi-agent
```

该 profile 打开与 `dsh web` 相同的 Web 应用，并为新会话默认选择 `multi-agent`。其工具集包含本地 `subagent` 与 `subagent_fork` 目标、`subagent_codex`、`subagent_claude_code`、`subagent_doubao`、`subagent_qwen`、后台任务控制和 workflow 工具。模型菜单还提供 Agent 选择器：Codex、Claude Code 与千问可分别指定后端模型，豆包则使用桌面应用当前可见的模型。

Codex 与 Claude Code 保留各自的原生账号和项目设置。本 bundle 不复制凭据、不执行登录、不替产品选择模型，也不会在主 Agent 调用工具前启动任一产品。原生登录缺失或不可用会成为该次委派的明确失败，浏览器会话的其余部分仍可使用。

豆包使用已登录的桌面应用，不需要方舟 API Key。请完全退出豆包，再使用 `--remote-debugging-port=9225` 启动其可执行文件，并保持聊天窗口打开。桥接每次委派都会创建可见对话，且绝不会自动终止或重启应用。

千问使用本机已鉴权的百炼 CLI。Provider 调用 `bl text chat`，凭据仍保留在 CLI 配置中，并通过工具的 `backend_model` 参数接收网页里选择的千问模型。

对于一次性产品任务，当协调者必须先得到答案才能继续时，请省略 `run_in_background`。将它设为 `true` 会返回通用 Job id，之后可用 `job_output` 收集结果。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本 bundle 是应用在 `dsh-base` 与 `dsh-web-app` 之后的静态 patch。它替换完整的 `agent-presets` 配置以选择 `multi-agent`，随后在 Host 平面插入 Codex、Claude Code、豆包桌面与千问 provider。Preset 独立授予对应的模型可见工具，因此 provider 可用性与 Agent 权限保持分离。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Profile 默认值与 Host 平面 provider 行 |
| [`src/index.ts`](src/index.ts) | 包入口；不携带运行时 API |
| [`tests/multi-agent-app.spec.ts`](tests/multi-agent-app.spec.ts) | Manifest、依赖与 patch 形态检查 |
| — | 不发布运行时不变式伴生入口；本 bundle 只拥有静态 patch 列表。 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Subagent 包映射](../../subagent/README.zh.md)——provider 与委派工具的职责。
- [Agent presets](../../preset/agent-presets/README.zh.md)——按会话组装与 preset 选择。
- [多 Agent 浏览器 profile 决策](../../../.agents/notes/implemented/feature/2026-09-04-multi-agent-browser-profile.zh.md)——设计依据与取舍。

-----

<a id="dev-note"></a>
## 开发备注

无。

-----

<a id="model-experience"></a>
## 模型体验

通过所选 multi-agent preset 以及各 provider 或工具包间接产生影响，由它们分别负责模型可见行为。

#### KV Cache 影响

本 bundle 自身不添加请求前缀；所选 preset 与其工具包负责各自的缓存影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **产品委派是一次性的**——Codex、Claude Code、豆包与千问返回最终文本或通用后台 Job 结果；其中间推理、工具活动、diff 与用量不会流式进入父会话。
- **原生产品交互保持无人值守**——需要人工批准或提问的产品请求会关闭失败，而不会在 Web 应用里打开第二条审批通道。
- **豆包是可见兼容桥**——它依赖显式开启的本地 CDP 端口和当前桌面 DOM，一次只支持一项文本任务，豆包更新后可能需要维护。
- **千问依赖百炼 CLI**——本机 CLI 必须保持安装和鉴权状态，并与已配置工作空间中开通的模型 id 一致。
