---
description: "AgentMux 多 Agent 控制终端的 Windows 桌面应用。"
kind: "package-reference"
---

# AgentMux 桌面版

[English](README.md) | 中文

AgentMux 桌面版现在是原生 Electron 应用。应用进程、原生窗口、单实例生命周期、页面导航策略和 Harness 后台进程均由 Electron 管理，不再启动 Microsoft Edge。`http://127.0.0.1:3080/` 网页版继续保留，并与桌面端共用同一套基于 DeepSeek Harness 的后端、会话记忆、Agent 路由和模型选择。

在仓库中执行 `pnpm desktop` 即可启动。如果 Harness 尚未运行，Electron 会用自身包含的 Node 兼容运行时启动 `multi-agent` profile，并在应用退出时停止由它创建的进程；如果 Harness 已运行，则验证并复用当前受用户权限保护的认证交接信息。

外部链接会交给系统浏览器打开，AgentMux 工作台始终留在原生窗口内。渲染层禁止 Node 集成，启用上下文隔离与沙箱，并把页面导航限制在带认证的本地服务。本桌面壳不会写入 API Key。

## 构建并安装 Windows 应用

执行以下命令生成 Electron NSIS 安装程序：

```sh
pnpm desktop:package
```

命令会在 `apps/desktop/dist` 下生成 `AgentMux-Setup.exe`。安装程序会把 AgentMux 安装到选择的 Windows 应用目录，创建桌面与开始菜单快捷方式，注册卸载程序，并可在安装结束后直接启动 AgentMux。

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
- 第一版 Electron 安装包仍会从已经记住的 AgentMux 构建仓库启动 Harness 后端；把完整运行环境裁剪并内置进安装包是下一项打包里程碑。
- 选择 Codex、Claude Code、豆包桌面版或千问时，仍需安装各自对应的本地应用或 CLI。
- 桌面端与网页端有意共用功能和后端状态，不会维护第二套容易分叉的界面。
