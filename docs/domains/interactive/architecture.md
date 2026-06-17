# 互动画布领域架构

更新日期：2026-06-17

互动画布领域关注用户在无限画布上组织可执行创作结构。它以 `neko-canvas` 的节点、连接、容器、route、preview session 和执行摘要为核心；Live、Scene、Character、Image、Audio、Video 是可引用能力或资产来源，不属于 `interactive` 领域自身真值。

## 模块职责

| 参与者               | 职责                                                       |
| -------------------- | ---------------------------------------------------------- |
| `neko-canvas`        | 无限画布、节点、容器、连接、端口、route、preview session   |
| `neko-story`         | 剧本、场景、镜头和角色语义来源                             |
| `neko-agent`         | workflow node、生成建议、执行解释、自动连接和审阅          |
| `neko-preview`       | 节点内媒体/文档/场景预览和授权投影                         |
| `neko-engine`        | 被引用媒体、scene、device、stream/control 能力的运行时权威 |
| Assets/Entity/Search | 节点引用、素材索引、角色/场景 grounding 和缩略图解析       |

## 稳定边界

- `interactive` 特指互动画布，不泛指所有实时互动、Live 或设备能力。
- Canvas 可以引用 Story、Image、Scene、Character、Audio、Video 的稳定事实，但不复制它们的编辑真值。
- 设备、scene/control、媒体 stream 等高频运行能力通过 Engine/client 或对应领域 contract 进入 Canvas，不由 Canvas Webview 直接访问宿主设备。
- Canvas Webview 保持节点交互状态；持久事实通过 canvas project data、ResourceRef、Entity/Search 或被引用领域格式保存。
- Agent 可以生成和审阅互动结构，但通过能力 provider 和 contract 进入领域，不直接耦合 Webview 实现。

## 基础模式与专业模式

Canvas 基础模式不是单一 AI 卡片模式，而是面向多类型创作节点的 Creative Graph。专业模式在同一底层图数据上进一步开放更多节点类型、连接语义和可执行工作流能力。

| 模式     | 定位                                               | 能力边界                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基础模式 | 多类型创作画布，用于组织创意、素材、分镜和生成结果 | 支持 Shot、Script、Document、Image、Video、Audio、Model、Character、Scene、Group、Artboard、Gallery 等创作语义节点；支持轻量语义连接、AI 生成、素材候选、基础属性和自动排布；默认隐藏 typed ports、执行状态、route/debug 等复杂度 |
| 专业模式 | 交互创作和工作流画布，用于构建可执行结构           | 在基础节点之上开放 workflow nodes、interaction nodes、typed ports、connection schema、variables、routes、preview session、execution summary、validation/debug 和子系统节点库                                                      |

右侧 Dock 应按模式暴露不同深度：基础模式优先显示创作节点库、当前节点基础属性、AI 生成/变体和素材候选；专业模式显示完整节点库、Inspector、ports/schema、变量、route、preview session、执行摘要和调试信息。两种模式共享同一 canvas graph，不另建轻量项目格式。

## 与 Scene Live profile 的关系

- `.nkm profile: live` 归 Scene 领域，保存 Live 舞台、actor、camera、routing 和合成配置。
- Canvas 可以用节点引用或编排 Live stage，但节点图本身不成为 `.nkm` 的替代真值。
- Live2D/Puppet 角色归 Character 领域；Canvas 只引用 `.nkp` 或触发角色动作/参数命令。

## 历史 ADR 归并

- Canvas interactive narrative、preview sessions/routes、node/container、connection projection：归并到本领域。
- Device management、XR authoring/runtime split、viewport semantic control：稳定横切约束可提升到 `docs/architecture/`，具体 Canvas 编排流保留在本领域。
- Canvas role boundary 进入本领域；live/audio/device 评估和实现计划进入 status 或对应领域。
