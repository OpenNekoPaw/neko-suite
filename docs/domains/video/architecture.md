# 视频创作领域架构

更新日期：2026-07-15

视频创作领域围绕“素材 -> 剧本/Agent 预处理 -> Canvas 分镜产物 -> 时间线剪辑 -> 预览 -> 导出/审阅”的创作闭环组织。该领域会跨 `neko-story`、`neko-canvas`、`neko-cut`、`neko-preview`、`neko-tools` 和 Engine/Agent/Assets 等横切能力。

## 模块职责

| 参与者                   | 职责                                                       |
| ------------------------ | ---------------------------------------------------------- |
| `neko-cut`               | Timeline、剪辑、轨道、关键帧、导出编排                     |
| `neko-preview`           | 视频、音频、文档、全景等预览 provider 和 Webview           |
| `neko-canvas`            | 已接受的分镜产物、节点、创作结构、预览路线和叙事投影       |
| `neko-story`             | 剧本解析、场景/角色索引、叙事预览和 story-agent payload    |
| `neko-tools`             | Media LSP、diff、诊断和工具面板                            |
| `neko-engine`            | 媒体探测、解码、编码、导出、流、质量分析                   |
| Agent                    | 视频理解、预处理判断、候选分镜生成、自动后期建议、质量审阅 |
| Assets / Entity / Search | 素材、角色、场景、引用、索引和审阅 grounding               |

## 稳定边界

- 媒体探测、解码、编码、导出、diff 和流生产走 Engine。
- TypeScript 层不重写 Engine 已有媒体计算；只做编排、UI 状态和结果投影。
- Webview 消费授权后的 H.264/PCM/fMP4 stream client，不直接访问工作区文件。
- Extension Host 管 custom editor、resource URI、StatusBar、导出命令和 Engine 授权。
- Story/Canvas/Cut/Preview 之间通过共享 contract、asset/entity/search 引用连接，不直接 import 对方实现。
- Canvas 的播放路线是 `CanvasPlaybackPlan` 的投影；默认以 Route Storyboard Matrix / route navigator 展示多分支、容器内连续节点和预览选择；它可以生成发送到 Cut 的剪辑初稿快照，但不成为 Cut 剪辑 timeline。
- Cut timeline 和 `.nkv` 是剪辑、轨道、clip、效果、字幕、音频和导出的权威；多个 `.nkv` 是相互独立的普通项目，从 Canvas 导入后由被显式选定的 Cut 项目管理剪辑事实。
- Agent 可以读取和展示 Canvas 顺序，并在确认后触发 Canvas -> Cut 导入；Agent 不维护独立 timeline 顺序，也不承担视频播放器职责，Canvas 路线播放由 Canvas Editor Webview 内的 `PlaybackWorkspace` 负责，Cut 结果播放由 Cut 或 `neko-preview` / Engine 负责。
- 所有 durable Cut mutation 必须携带显式 `.nkv` document identity 和 expected revision，或显式 `new` target。活动/最近编辑器、普通生成完成和 Workspace Board 投影都不能隐式选择 Cut 项目；generated-output/Board-to-Cut 只通过用户或 Agent 明确表达的 authoring intent 发生。
- 被动状态进入 native StatusBar，Timeline 和画布交互状态留在 Webview。

### Agent 驱动的影视化与动画化

视频领域不提供固定“漫画/剧本/小说/插画 -> 动画”的中央流水线。Agent 读取当前来源和项目证据，按镜头选择分格/OCR、角色参考、Storyboard、图片准备、Puppet/逐帧/2.5D/3D/生成视频、Animatic、Audio、Quality 和 Export 等当前真实可用能力；每一步由 owning package 返回文件、ResourceRef、Task result、project revision 或 diagnostic。

角色和镜头参考可以来自参考图启发的新内容生成或多视图角色卡。Agent 不根据猜测的参考图来源模型选择 Provider；当前图片 capability 明确支持单张多视图时可以一次生成，并在实际结果复查和必要审批后作为后续镜头参考。正式角色引用继续由 Entity/Asset/Character owner 管理，Video/Cut 只消费稳定引用和适用 revision。

影视生成 Prompt 的指导语言、创作者内容语言和 Provider 执行指令语言相互独立。视频模型偏好英文指令时，中文角色名、对白、字幕和画面文字仍必须按批准内容保留；模型不能可靠支持时应在生成前暴露 diagnostic，并显式选择字幕或后期文字策略。

镜头主体、动作、运镜、时长意图、角色/场景连续性、first-frame/last-frame 等参考角色和验收条件是模型无关创作语义；当前 Provider/model/version/profile 是否接受对应输入、如何传递、支持的实际时长/控制和 Prompt 方言属于模型绑定执行事实。切换模型或 profile 后必须重新 resolve/validate，不能沿用旧参数或支持声明。

Prompt 图库或单次成功视频/图片可以帮助 Agent理解表达方式，但不能成为 Video capability truth、Provider selector 或完成证据。实际请求必须记录有效模型和输入引用，实际片段与后续 Quality/Cut 结果才证明镜头可用。

复杂制作可以使用 creator-review Markdown 和 living `plan.md`，但它们不编译成 timeline、DAG 或 Tool 调用。近期 TODO 不复制完整 shot graph；Canvas Storyboard、Cut timeline、生成文件和 Task result 才是进度与完成事实。缺少 owning capability 时必须返回 blocked/partial 和最小可交付结果。

Canvas 预览路线、Cut 剪辑时间线、Agent 顺序感知和跨包协议边界见系统级 ADR：[`../../architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md`](../../architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md)。

## Canvas 分镜语义提示词 Authoring

Canvas 分镜表采用 prompt-first authoring，但提示词权威不是裸字符串，而是 Canvas 持久化的 Semantic Prompt Document。每个镜头可以在 `storyboardPrompt` 下保存 image、video、voice prompt documents；文档包含 prompt text、semantic spans、字段投影、资源引用、diagnostics、alignment state、task/result refs 和 `nextCreativeState`。旧 `generationPrompt` 只作为 prelaunch migration/import input 或只读诊断来源，不能作为新分镜提示词权威。

Scene 是长视频制作的审阅单位。Canvas scene storyboard table 是 review projection，不是字段数据库，也不是生成任务 dashboard；主列固定为：

```text
Shot | Reference Media | Image Prompt | Video Prompt | Duration | Dialogue | State | Action
```

- `Image Prompt` 仅在参考图需要切分、上色、补全、修复、重绘、风格统一或关键帧生成时成为创作输入；参考图可直接用于视频时可为空。
- `Video Prompt` 是视频生成/编辑的核心提示词输入。
- `Reference Media` 可承载图片引用；video/audio reference、seed、negative prompt、camera control、motion strength、aspect ratio 等模型参数只在 capability 支持时出现在详情或确认面板，不进入主表固定列。
- `State` 来自 `nextCreativeState`，表示当前阻塞点或下一步创作操作，例如缺参考图、需处理参考图、缺视频提示词、等待确认、需审查结果、需修复 alignment、可接受结果；它不展示 provider progress、queue logs 或成本事件。
- `Action` 是固定 creative intent，例如 process reference、optimize image prompt、optimize video prompt、generate video、review result、fix alignment、accept result、retry。纯 UI 操作如 open details、locate shot、reveal reference、view queue 仍由 Canvas Webview 本地处理。

跨包闭环保持以下边界：

```text
Canvas storyboard row action
  -> typed storyboard action intent
  -> Agent approval / capability check / async task
  -> structured task writeback
  -> Canvas validates /storyboardPrompt and resource identity
  -> scene table projection updates nextCreativeState
```

Canvas 负责 semantic prompt documents、字段/profile validation、资源/实体绑定、节点创建、结构化写回校验、表格投影和持久化。Agent 负责推理、是否需要用户确认、provider/subagent/worker 编排、异步任务进度、日志、失败重试和结果审阅。Agent 内部可以派发 worker 或 subagent，但 Canvas 只保存 task refs、result refs、diagnostics 和下一步状态，不保存 worker/subagent identity。

`@neko/markdown` 只提供 Markdown 扩展语法、纯 projection DTO、diagnostics 和 renderer/resolver adapter contract。Markdown 分镜表、`@mention`、CommonMark image、Neko resource reference 和 semantic prompt spans 可以帮助 Agent Webview 展示和 handoff，但不会执行 Canvas validation，也不会成为 Canvas 节点或分镜字段权威。生产导入 Markdown 分镜时由 Canvas Markdown capability 创建 `storyboardPrompt` semantic prompt documents；名为 `Generation Prompt` 或 `generationPrompt` 的 Markdown 列只被解释为 prompt 输入，不允许重建 `/generationPrompt` 新权威路径。

## 基础模式与专业模式

视频编辑器按创作深度区分快速成片和精修剪辑。两种模式共享同一 timeline/project truth，基础模式隐藏大部分轨道、关键帧和编码细节，专业模式暴露完整 timeline 编辑能力。

| 模式     | 定位                    | 能力边界                                                                                                             |
| -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 基础模式 | AI 快剪和模板化视频创作 | 自动成片、节奏剪辑、模板、字幕生成/校正、智能裁切、基础调色、基础音量、封面、快速导出和 AI 建议卡片                  |
| 专业模式 | 多轨 timeline 精修      | 多轨 timeline、clip/track 属性、关键帧、转场、遮罩、字幕样式、色彩校正、音频属性、效果参数、导出参数、质量诊断和审阅 |

右侧 Dock 的当前实现按同一属性面板裁剪分组：基础模式显示 AI Actions、当前片段基础属性、Transform、文本/字幕、音频基础参数和响度归一；专业模式在此基础上开放 Blend Mode、Speed、入/出转场、Color Correction、Effects 和 Masks。基础模式产生的操作必须落到可被专业模式继续编辑的 timeline 结构。

## 数据流

```text
Assets / Story / Canvas / Agent
  -> preview route or timeline intent
  -> Extension authorization
  -> CanvasCutDraftPayload when sending Canvas route to Cut
  -> Engine probe / stream / diff / export
  -> Webview playback or result projection
  -> asset/entity/search/review grounding
```

## 历史 ADR 归并

- 漫画到动画的 `media-production/from-comic` profile、video understanding、AI video reference：归并到视频创作与 Agent 集成细则或 research。
- cut timeline assessment、media quality assessment：归入 status gap。
- viewport stream control、panoramic preview：与 Engine/Preview 交叉，稳定约束提升到 Engine 或本领域。
