---
description: "一次性豆包桌面版 subagent provider：通过用户显式开启的本地 CDP 端点自动操作可见聊天窗口。"
kind: "package-reference"
---

# @deepseek-ai/dsh-subagent-doubao-desktop

[English](README.md) | 中文

## 概述

`dsh-subagent-doubao-desktop` 让 Harness Agent 无需方舟 API Key，即可把一项文本任务委派给已经登录的豆包桌面版。它连接用户显式开启的 Chrome DevTools Protocol 端点，打开一段新的可见豆包对话，通过页面输入框提交任务说明，等待回复稳定，然后经 `ctx.subagents` 返回文本。

这是非官方兼容桥，不是豆包公开 API。它不读取账号密码，也不复制浏览器 Cookie；但每个委派提示都会发送给豆包，并保留在桌面账号的对话历史中。

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

完全退出所有豆包桌面窗口，然后用仅监听回环地址的调试端口启动真实可执行文件：

```powershell
& 'C:\Path\To\Doubao.exe' --remote-debugging-port=9225
```

保持窗口打开且账号已登录。在现有 `ctx.subagents` 服务之上安装 provider，再让委派工具指向它：

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

随附的 `multi-agent` profile 已包含这些行。它绝不会自动终止或重启豆包。如果应用已经在没有 CDP 的情况下运行，委派会返回重启说明，而不会擅自改变桌面状态。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `providerName` | `doubao-desktop` | `ctx.subagents` 上的注册名 |
| `cdpUrl` | `http://127.0.0.1:9225` | 用户开启的回环 CDP 端点 |
| `chatUrl` | `https://www.doubao.com/chat` | 每次委派使用的新对话页 |
| `timeoutMs` | `180000` | 连接与回复的总截止时间 |
| `pollIntervalMs` | `2000` | 回复观察间隔 |
| `stablePolls` | `2` | 判定完成前内容保持不变的次数 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Provider 使用 Node 内置 Fetch 与 WebSocket，因此不增加浏览器自动化运行时。它只发现 URL 属于 `doubao.com` 的 `page` target，连接该渲染器、将其置于前台，并通过 CDP runtime evaluation 与按键事件操作可见输入框。回复收集跟随豆包虚拟化消息行，并在返回文本前移除建议按钮与操作栏。

同一时间只能有一次运行占用可见豆包聊天。取消会断开桥接，但绝不会关闭豆包进程。错误以固定阶段和类别事实穿过 subagent 边界，详细原因只保留在 Host 日志中。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Provider 注册、一次性生命周期、取消与诊断 |
| [`src/cdp.ts`](src/cdp.ts) | CDP 传输、target 校验、输入框写入与稳定回复收集 |
| [`tests/subagent-doubao-desktop.spec.ts`](tests/subagent-doubao-desktop.spec.ts) | Target、提示词引用、选择器与任务形态检查 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Subagent 包映射](../README.zh.md)——provider 与委派工具的职责。
- [多 Agent 浏览器 profile](../../bundle/multi-agent-app/README.zh.md)——启用本 provider 的现成组合。

-----

<a id="dev-note"></a>
## 开发备注

参见[多 Agent 浏览器 profile 决策](../../../.agents/notes/implemented/feature/2026-09-04-multi-agent-browser-profile.zh.md)。

<a id="model-experience"></a>
## 模型体验

### 子请求

#### 模型看到的内容

豆包会在一段新桌面对话中收到完整委派说明，但看不到父级 transcript、workspace 或 Harness 工具。所用后端就是桌面应用当前可见的模型。

#### Token 影响

Harness 无法观察豆包桌面版的 token 核算。父级只承担工具调用中的委派说明，以及作为工具结果返回的最终回复。

#### KV Cache 影响

每次请求都会打开新的豆包对话，因此不假设 provider 端存在前缀复用。父级工具结果追加在其可复用请求前缀之后。

### 父级调度与结果（间接）

#### 模型看到的内容

父 Agent 通过 `dsh-tool-subagent` 看到一次性的 `subagent_doubao` 工具，并且只接收豆包最终可见回复或固定失败诊断。桌面 DOM 细节、账号状态与中间界面变化不会复制进父 Session。

#### Token 影响

父上下文会增加委派说明以及返回答案或失败信息；Harness 无法观察豆包桌面版自身的用量核算。

#### KV Cache 影响

仅追加：返回的工具结果位于父级可复用前缀之后，不会改写早先消息。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **非官方 UI 约定**——豆包版本可能改变渲染器 URL、DOM 类名或输入框行为，需要维护选择器。
- **可见的单用户表层**——并发豆包委派会被拒绝；桥接会把聊天置于前台并改变当前可见对话。
- **仅文本一次性输出**——文件上传、图片、引用、进度、续接和原生工具轨迹不会返回。
- **由用户开启调试**——CDP 可以检查已登录的渲染器。只在回环地址使用，不要通过防火墙或代理暴露；不需要桥接时，正常关闭并重启豆包即可。
