# 视频创作领域架构

更新日期：2026-06-15

视频创作领域围绕“素材 -> 剧本/Agent 预处理 -> Canvas 分镜产物 -> 时间线剪辑 -> 预览 -> 导出/审阅”的创作闭环组织。该领域会跨 `neko-story`、`neko-canvas`、`neko-cut`、`neko-preview`、`neko-tools` 和 Engine/Agent/Assets 等横切能力。

## 模块职责

| 参与者                   | 职责                                                    |
| ------------------------ | ------------------------------------------------------- |
| `neko-cut`               | Timeline、剪辑、轨道、关键帧、导出编排                  |
| `neko-preview`           | 视频、音频、文档、全景等预览 provider 和 Webview        |
| `neko-canvas`            | 已接受的分镜产物、节点、创作结构、预览路线和叙事投影     |
| `neko-story`             | 剧本解析、场景/角色索引、叙事预览和 story-agent payload |
| `neko-tools`             | Media LSP、diff、诊断和工具面板                         |
| `neko-engine`            | 媒体探测、解码、编码、导出、流、质量分析                |
| Agent                    | 视频理解、预处理判断、候选分镜生成、自动后期建议、质量审阅 |
| Assets / Entity / Search | 素材、角色、场景、引用、索引和审阅 grounding            |

## 稳定边界

- 媒体探测、解码、编码、导出、diff 和流生产走 Engine。
- TypeScript 层不重写 Engine 已有媒体计算；只做编排、UI 状态和结果投影。
- Webview 消费授权后的 H.264/PCM/fMP4 stream client，不直接访问工作区文件。
- Extension Host 管 custom editor、resource URI、StatusBar、导出命令和 Engine 授权。
- Story/Canvas/Cut/Preview 之间通过共享 contract、asset/entity/search 引用连接，不直接 import 对方实现。
- Canvas 的播放路线是 `CanvasPlaybackPlan` 的投影；默认以 Route Storyboard Matrix / route navigator 展示多分支、容器内连续节点和预览选择；它可以生成发送到 Cut 的剪辑初稿快照，但不成为 Cut 剪辑 timeline。
- Cut timeline 和 `.nkv` 是剪辑、轨道、clip、效果、字幕、音频和导出的权威；从 Canvas 导入后由 Cut 管理剪辑事实。
- Agent 可以读取和展示 Canvas 顺序，并在确认后触发 Canvas -> Cut 导入；Agent 不维护独立 timeline 顺序，也不承担视频播放器职责，Canvas 路线播放由 Canvas Editor Webview 内的 `PlaybackWorkspace` 负责，Cut 结果播放由 Cut 或 `neko-preview` / Engine 负责。
- 被动状态进入 native StatusBar，Timeline 和画布交互状态留在 Webview。

Canvas 预览路线、Cut 剪辑时间线、Agent 顺序感知和跨包协议边界见系统级 ADR：[`../../architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md`](../../architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md)。

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

- comic-to-animation、video understanding、AI video reference：归并到视频创作与 Agent 集成细则或 research。
- cut timeline assessment、media quality assessment：归入 status gap。
- viewport stream control、panoramic preview：与 Engine/Preview 交叉，稳定约束提升到 Engine 或本领域。
