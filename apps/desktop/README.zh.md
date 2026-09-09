---
description: "AgentMux 多 Agent 控制终端的 Windows 桌面应用。"
kind: "package-reference"
---

# AgentMux 桌面版

[English](README.md) | 中文

AgentMux 桌面版现在是原生 Electron 应用。应用进程、原生窗口、单实例生命周期、页面导航策略和 Harness 后台进程均由 Electron 管理，不再启动 Microsoft Edge。`http://127.0.0.1:3080/` 网页版继续保留，并与桌面端共用同一套基于 DeepSeek Harness 的后端、会话记忆、Agent 路由和模型选择。

在仓库中执行 `pnpm desktop` 即可启动。正式安装版会从 `resources/runtime` 启动 `multi-agent` profile；该目录是构建时自动生成并精简的完整生产依赖闭包，已内置在安装包中，因此目标电脑不需要 AgentMux 源码、Node.js 或 pnpm。应用退出时会停止由它创建的后台进程；如果 Harness 已运行，则验证并复用当前受用户权限保护的认证交接信息。

外部链接会交给系统浏览器打开，AgentMux 工作台始终留在原生窗口内。渲染层禁止 Node 集成，启用上下文隔离与沙箱，并把页面导航限制在带认证的本地服务。本桌面壳不会写入 API Key。

## 构建并安装 Windows 应用

执行以下命令生成 Electron NSIS 安装程序：

```sh
pnpm desktop:package
```

命令会重新生成独立运行时、清除仅供开发使用的文件，并在 `apps/desktop/dist` 下生成 `AgentMux-Setup.exe`。安装程序会把 AgentMux 及其运行时安装到选择的 Windows 应用目录，创建桌面与开始菜单快捷方式，注册卸载程序，并可在安装结束后直接启动 AgentMux。由于包含完整本地后台，压缩安装包会明显大于早期的轻量桌面预览版。

Electron Builder 的发布信息已经指向本项目的 GitHub Releases。在具备代码签名和稳定更新通道前，应用内自动安装更新仍保持关闭。

## 模型体验

### 桌面壳（间接）

#### 模型看到的内容

桌面壳不会新增模型指令或工具。它展示与浏览器版相同的多 Agent 会话界面，包括协调模型、Agent 选择策略以及每个已选产品模型。模型请求由这些共用包构建，而不是由桌面壳构建。

#### Token 影响

除共享 Harness 会话之外没有额外影响；桌面壳自身不会调用模型。

#### KV Cache 影响

无。提示词构建仍由共用的 Web 与 Host 包负责。

## 已知限制与后续工作

- 生成的安装程序尚未签名；正式分发仍需 Authenticode 证书与可信的 HTTPS 发布地址。
- 各模型服务的账号和凭据仍由用户自行管理，不会写入安装包。Codex 与 Claude 的运行程序由锁定版本的官方 SDK 包携带；选择豆包桌面版或千问时，仍需对应的本地产品或 CLI。
- 桌面端与网页端有意共用功能和后端状态，不会维护第二套容易分叉的界面。
