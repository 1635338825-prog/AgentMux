---
description: "AgentMux 多 Agent 控制终端的 Windows 桌面应用。"
kind: "package-reference"
---

# AgentMux 桌面版

[English](README.md) | 中文

AgentMux 会在独立窗口中打开现有的多 Agent 网页界面。它保留 `http://127.0.0.1:3080/` 网页版，共用同一套基于 DeepSeek Harness 的后端、会话记忆和 Agent 功能，并使用独立的本地窗口资料目录。Web 服务重启后，桌面壳会读取当前受用户权限保护的运行时交接地址，不再重新打开带有过期 token 的旧 URL。

在仓库中执行 `pnpm desktop` 即可启动。如果 Harness 服务尚未运行，桌面壳会启动 `multi-agent` profile，并在窗口关闭后停止由它创建的服务；如果服务已运行，则直接复用。

首次开发启动可通过 `pnpm desktop -- --url <url>` 传入控制台打印的鉴权地址。短期启动地址会保存在用户的本地应用数据目录中；本桌面壳不会写入 API Key。

## 构建并安装 Windows 应用

执行以下命令生成便携程序与安装程序：

```sh
pnpm desktop:package
```

命令会在 `apps/desktop/dist` 下生成 `AgentMux.exe`、`AgentMux-Setup.exe` 和 `latest.json`。在已经构建好的仓库中运行一次 Setup：它会把程序安装到当前用户的本地 Programs 目录，创建桌面与开始菜单快捷方式，默认开启登录时启动，记住已构建的项目根目录，并打开安装后的应用。如果不希望登录时启动，可给 Setup 传入 `--no-startup`。

自动更新由 manifest 驱动。把 `latest.json` 与对应 Setup 放在同一个 HTTPS 来源，再在首次安装时传入 `--update-manifest https://example.com/path/latest.json`。此后应用启动时会检查版本，仅接受更高的语义化版本，校验 Setup 的 SHA-256，在当前进程退出后替换已安装程序并重新打开。默认不启用任何更新地址。

## 模型体验

### 桌面壳（间接）

#### 模型看到的内容

桌面壳不会新增模型指令或工具。它展示与浏览器版相同的多 Agent 会话界面，包括协调模型、Agent 选择策略以及每个已选产品模型。模型请求由这些共用包构建，而不是由桌面壳构建。

#### Token 影响

除共享 Harness 会话之外没有额外影响；桌面壳自身不会调用模型。

#### KV Cache 影响

无。提示词构建仍由共用的 Web 与 Host 包负责。

## 已知限制与后续工作

- Windows 当前使用系统已安装的 Microsoft Edge 应用模式运行时承载独立窗口。
- 生成的安装程序尚未签名；正式分发仍需 Authenticode 证书与可信的 HTTPS 发布地址。
- 打包后的启动器自带 Node 运行时，但当前后端仍从记住的已构建仓库启动，并依赖所选 Agent 使用的产品 CLI。
- 如果服务由桌面壳之外的程序启动，需要先在桌面资料目录中用带鉴权的启动地址打开一次。
- 桌面端与网页端有意共用功能和后端状态，不会维护第二套容易分叉的界面。
