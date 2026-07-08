# 客户端产物目标与职责边界

状态：Accepted  
更新日期：2026-07-08

本文定义 Neko Suite 当前三个客户端产物的目标边界：TUI、VSCode 插件客户端和独立桌面编辑器。它们共享 Agent runtime、领域 capability、Host adapter ports、Engine client 与 Rust Engine，但服务不同的产品目标，不追求功能完全等价。

## 目标总览

| 产物              | 核心身份                           | 目标                                                                                                  | 非目标                                                                               |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| TUI 客户端        | Agent 与模型验证实验台             | 验证 Agent 功能、模型效果、Skill/Tool 行为、真实 API、消融实验和回归测试                              | 不做图形化创作编辑，不渲染 Canvas/Timeline/Video/Audio，不依赖 VSCode                |
| VSCode 插件客户端 | 轻量插件化创作客户端               | 借 VSCode 文件、命令、扩展、Custom Editor 和 Webview 生态快速扩展能力与完成轻量创作编辑               | 不承担专业渲染输出真值，不为了突破 VSCode Webview 限制复制 Engine 计算               |
| 独立编辑器        | 专业创作客户端与稳定自动化验收宿主 | 提供更友好的专业 UI、更高的编辑器上限、更好的渲染效果，并提供比 VSCode 原生测试更可控的自动化测试路径 | 不替代 VSCode 插件生态，不拥有领域 runtime，不用 Electron WebContents 当专业输出真值 |

## TUI：Agent / 模型实验台

TUI 的主要价值是让 Agent 和模型行为可快速运行、可重复验证、可比较。它优先服务以下场景：

- Agent runtime、Skill、Tool、MCP、Capability loader 和 host-neutral provider 的路径级验证；
- 模型效果对比、参数 preset 对比、prompt/skill 消融实验和真实 API smoke；
- 单次 run、批量 suite、结构化报告、replay、golden case 和回归定位；
- headless 内容读取、`@` 引用、artifact、queue、capability diagnostics 等终端安全投影。

TUI 不应为了追求 GUI parity 引入 VSCode、Webview、Canvas、Timeline 或媒体播放器依赖。图像、音频、视频和工程对象在 TUI 中应表现为稳定引用、摘要、诊断和可保存产物，而不是交互式编辑面。

成功指标：

- 验证速度快；
- 输出可比较；
- 失败可定位；
- 不依赖 VSCode 启动、Extension activation 或 Webview runtime。

## VSCode：轻量插件化创作客户端

VSCode 插件客户端是当前可用的创作入口和扩展生态入口。它利用 VSCode 的 workspace、文件管理、命令面板、Custom Editor、Webview、状态栏和扩展依赖机制，提供轻量创作和快速能力扩展。

它优先服务以下场景：

- Story、Canvas、Cut、Preview、Model、Sketch、Puppet、Audio、Assets、Market、Dashboard、Search 和 Agent Webview 的集成式工作流；
- 快速创建、编辑、预览、导入、管理和跨插件编排；
- 第三方或内部能力通过 VSCode extension、command bus、exported API、capability provider 和 install target 进入 Neko；
- 本地创作项目的快速迭代、轻量剪辑、画布编排、素材管理和 Agent 协同。

VSCode 客户端必须承认 Webview 宿主限制：CSP、resource projection、Range、codec、focus、Extension/Webview 生命周期、自动化测试稳定性和专业 GPU/色彩输出边界。它可以显示 Engine 授权 stream、缩略图和预览投影，但不把这些 Webview projection 当作专业媒体/Scene 输出真值。

成功指标：

- 插件扩展容易；
- 轻量创作路径短；
- Webview 沙箱正确；
- Engine-first 媒体和运行时权威清晰。

## 独立编辑器：专业创作与可控验收

独立编辑器面向专业创作场景。它的目标不是替代 VSCode，而是在 VSCode 边界成为瓶颈时提供新的本地 AppHost：更友好的用户界面、更高的交互和渲染上限、更稳定的自动化验收。

它优先服务以下场景：

- 专业资源工作台、素材/实体/生成/市场/技能/Search 分离管理面；
- 更可控的窗口、菜单、拖拽、文件对话框、快捷键、焦点和多面板布局；
- Engine-owned viewport/session，用于视频、媒体、Scene、HDR、色彩、frame clock、texture lease 和后续 native surface；
- 自动化测试：稳定启动、可控 IPC、可截图/可断言 UI 状态、可驱动测试数据，避免 VSCode Extension Host 和 Webview 测试中的不稳定因素。

Electron MVP 只是 AppHost 和 UI shell。专业输出真值仍属于 Rust Engine；renderer 只通过 typed preload bridge 发送 intent、显示投影和诊断。后续若切换 Tauri 或 native host，也应实现同等 host/AppHost contracts，而不是改变领域 runtime。

成功指标：

- 专业编辑体验上限高于 VSCode Webview；
- 渲染与导出真值收敛到 Engine；
- 自动化验收更稳定、更容易复现；
- Desktop 只做 composition root，不吞并领域包职责。

## 共享边界

三个产物共享的原则：

- Agent 行为进入 `@neko/agent`、`@neko/platform`、`@neko-agent/types` 和 host-neutral capability，而不是散落在客户端 UI 中。
- 跨层通信先定义共享 contract、Proto、Host port 或 Engine client，再接具体宿主。
- TUI、VSCode 和 Desktop 在 composition root 注入各自 host adapter；领域语义仍由 owning package 提供。
- 媒体、Scene、Puppet、Audio、Device、ML、导出和专业 viewport 真值属于 `neko-engine`。
- 客户端可以投影资源、诊断、缩略图和短生命周期 descriptor，但持久项目事实只能保存 portable refs、ResourceRef、asset/entity id、workspace-relative path 或领域格式。

## 决策后果

- TUI 的路线应优先投资测试、报告、消融和模型评估能力。
- VSCode 的路线应优先投资插件扩展、轻量创作路径和 Webview/Extension/Engine 边界稳定。
- Desktop 的路线应优先投资专业 UI、Engine viewport、资源工作台和可控自动化验收。
- 新能力设计时必须先说明它属于哪个客户端目标；若要跨两个以上客户端复用，应通过共享 contract、domain provider、Host port 或 Engine client 暴露，而不是复制实现。

## 相关文档

- [`adr-neko-desktop-apphost-resource-viewport-boundary.md`](adr-neko-desktop-apphost-resource-viewport-boundary.md)
- [`package-boundaries.md`](package-boundaries.md)
- [`engine-runtime.md`](engine-runtime.md)
- [`agent.md`](agent.md)
- [`adr-agent-runtime-architecture-comparison-boundary.md`](adr-agent-runtime-architecture-comparison-boundary.md)
