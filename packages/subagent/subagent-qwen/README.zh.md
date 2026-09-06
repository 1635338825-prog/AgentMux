---
description: "通过已鉴权百炼 CLI 调用千问的一次性子 Agent Provider。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-qwen

[English](README.md) | 中文

## 概述

`dsh-subagent-qwen` 允许 Harness 协调器通过本机已鉴权的阿里云百炼 CLI，把文本任务委派给千问模型。Provider 启动受管理的 `bl text chat` 进程，通过标准输入发送任务，解析 JSON 答案，并通过 `ctx.subagents` 只返回助手文本。

## 使用本包

先安装并登录 `bl`，再挂载 Provider 和模型可见工具：

```yaml
- name: '@deepseek-ai/dsh-subagent-qwen'
- name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: qwen
    toolName: subagent_qwen
    maxDepth: provider-managed
```

随附的 `multi-agent` profile 已包含这套组合。网页中的 Agent 选择器可以启用千问并选择 Provider 公布的模型 id；所选值会作为 `backend_model` 真正传过工具边界。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `providerName` | `qwen` | `ctx.subagents` 上的注册名 |
| `model` | `qwen3.8-max` | 默认百炼模型 |
| `models` | 千问模型列表 | 向网页选择器公开的模型 |
| `command` | Windows：Volta 可执行文件；其他系统：`bl` | 启动已安装 CLI 的可执行程序 |
| `commandArgs` | Windows：`run bl`；其他系统：无 | 插入到 `text chat` 前的参数 |
| `timeoutMs` | `180000` | 整次请求的超时 |

## 开发说明

参见[多 Agent 网页 Profile 决策](../../../.agents/notes/implemented/feature/2026-09-04-multi-agent-browser-profile.zh.md)。

## 模型体验

### 子请求

#### 模型看到的内容

千问会收到一份自包含文本任务、Provider 的简短系统指令、已选 `backend_model`，但不会获得父对话或 Harness 工具。鉴权保留在用户的百炼 CLI 配置中，不会复制进代码仓库。

#### Token 影响

千问子请求由百炼独立计量；子请求 token 不会进入父 Agent 上下文。

#### KV Cache 影响

每次调用都是新的 `bl text chat` 请求，因此 Provider 不假设存在可复用的对话前缀。

### 父级调度与结果（间接）

#### 模型看到的内容

父 Agent 通过 `dsh-tool-subagent` 看到一次性的 `subagent_qwen` 工具和可选 `backend_model` 参数，并收到最终助手文本或固定失败诊断。千问推理、CLI 原始输出、凭据与用量不会复制进父 Session。

#### Token 影响

父上下文会增加委派说明以及返回答案或失败信息；百炼侧用量由所选千问模型独立计量。

#### KV Cache 影响

仅追加：千问工具结果写在父级可复用前缀之后，不会改写早先消息。

## 已知限制与后续工作

- **仅文本、一次性**——暂不返回续聊、文件、图片、工具轨迹或流式进度。
- **依赖 CLI 安装**——默认启动命令匹配当前 Volta 安装；其他安装方式可配置 `command` 与 `commandArgs`。
- **模型目录由部署方维护**——管理员需要让 `models` 与百炼工作空间实际开通的模型 id 保持一致。
