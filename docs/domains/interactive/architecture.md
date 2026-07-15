# 互动画布领域架构

更新日期：2026-07-15

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
- Canvas route、preview session 和 `CanvasPlaybackPlan` 是互动画布内部的播放投影；默认可用 Route Storyboard Matrix 展示 route/branch 行、step 列、容器分组和可播放 cell；多输入生成、reference、prompt 和素材依赖属于 workflow / derivation projection，不会默认进入播放 route；当服务视频创作时，只能通过剪辑初稿快照交给 Cut，不能复用或拥有 Cut timeline。
- 设备、scene/control、媒体 stream 等高频运行能力通过 Engine/client 或对应领域 contract 进入 Canvas，不由 Canvas Webview 直接访问宿主设备。
- Canvas Webview 保持节点交互状态；持久事实通过 canvas project data、ResourceRef、Entity/Search 或被引用领域格式保存。
- Agent 可以生成和审阅互动结构，但通过能力 provider 和 contract 进入领域，不直接耦合 Webview 实现。

Canvas 预览路线与 Cut 剪辑时间线的跨领域边界见 [`../../architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md`](../../architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md)。

## 基础模式与专业模式

Canvas 基础模式不是单一 AI 卡片模式，而是面向多类型创作节点的 Creative Graph。专业模式在同一底层图数据上进一步开放更多节点类型、连接语义和可执行工作流能力。

| 模式     | 定位                                               | 能力边界                                                                                                                                                                                                                          |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基础模式 | 快速创作与素材组织                                 | 右侧创建目录只显示文件/引用、文本与 Markdown 文档、剧本呈现、图片/音频/视频，以及中性的 Group/Artboard；不显示 Storyboard 表、Scene/Shot/Gallery、timeline/workflow、Agent/Tool/Skill/Model/Provider 等专业创建入口 |
| 专业模式 | 交互创作和工作流画布，用于构建可执行结构           | 在基础节点之上开放 workflow nodes、interaction nodes、typed ports、connection schema、variables、routes、preview session、execution summary、validation/debug 和子系统节点库                                                      |

右侧 Dock 按模式暴露不同深度。Basic 只是目录投影和默认创作策略，不写入 `.nkc`，不限制已有节点，也不定义第二套 renderer/validator。含专业节点的 `.nkc` 在 Basic 下仍按现有 renderer 展示；用户显式切换 Professional 后继续使用完整子系统目录。两种模式共享同一 canvas graph，不另建轻量项目格式。

基础节点的展示由 node descriptor 决定：文件/引用、文本/Markdown、剧本呈现、图片、音频和视频使用名称加内容的 low-chrome shell；Scene/Shot、Storyboard、Gallery、Table、Timeline、Workflow、Agent/Tool 和 typed-port 节点继续使用 owning structured renderer。该 presentation 只属于 UI contract，不进入 `.nkc`。

普通 `group` 是半透明空间容器，展开时渲染真实后代而不是摘要行。`position` 始终是绝对 Canvas 坐标；移动 Group 会平移完整后代子树，移动 child 不改变 sibling，排序/自动排列、Fit、折叠都是显式且可撤销的操作。Scene/Gallery/Table 等 managed container 继续使用自己的 layout/render policy。

## Board 目录约定

Board 与 Canvas 是同一个概念：`neko/boards/*.nkc` 都是普通 `.nkc`，使用现有 codec、revision、source policy、节点和连接语义。`neko/boards/` 只用于 Agent 未指定目标时的默认检索与创建，不产生 Draft、Board profile、`.nkdraft`、升级或转换流程。

未指定目标的创作运行按固定顺序解析：显式 Canvas → 有效会话/任务绑定 → 唯一精确 project/work/scope 匹配 → 创建新的 `neko/boards/<safe-name>.nkc`。不得用活动/最近画布、专业目录画布、文件名或语义相似度静默替代。每次 turn/task/run 在异步工作前冻结 document/canvas/revision 身份，完成时只向该目标写入；冲突或删除返回可见诊断。

Agent 自动写入的 Markdown 与已持久化文件/引用通过 Canvas 公共 headless authoring；不得直接改 `.nkc` JSON。未提升的图片/音频/视频生成结果只作为 Extension-owned runtime review Group 投影，不进入 `.nkc`。用户显式 Save to Assets 后，AssetLibrary/AssetStore 返回稳定 Asset identity，Canvas 才能向冻结的 Board target revision 写入普通 Group 与 Asset-backed children；不得回退活动 Canvas。

`neko/generated/<kind>/` 只保留历史文件读取和显式导入。新生成结果不得写入该目录作为 Canvas retention；导入历史来源不会删除、移动或静默重写原文件与既有 Canvas 引用。删除 Canvas Group/节点也只删除 Canvas 引用，不删除 AssetLibrary 实体或文件。

## 与 Scene Live profile 的关系

- `.nkm profile: live` 归 Scene 领域，保存 Live 舞台、actor、camera、routing 和合成配置。
- Canvas 可以用节点引用或编排 Live stage，但节点图本身不成为 `.nkm` 的替代真值。
- Live2D/Puppet 角色归 Character 领域；Canvas 只引用 `.nkp` 或触发角色动作/参数命令。

## 历史 ADR 归并

- Canvas interactive narrative、preview sessions/routes、node/container、connection projection：归并到本领域。
- Device management、XR authoring/runtime split、viewport semantic control：稳定横切约束可提升到 `docs/architecture/`，具体 Canvas 编排流保留在本领域。
- Canvas role boundary 进入本领域；live/audio/device 评估和实现计划进入 status 或对应领域。
