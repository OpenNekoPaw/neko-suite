# 视频创作领域架构

更新日期：2026-06-15

视频创作领域围绕“素材 -> 剧本/分镜 -> 画布编排 -> 时间线剪辑 -> 预览 -> 导出/审阅”的创作闭环组织。该领域会跨 `neko-story`、`neko-canvas`、`neko-cut`、`neko-preview`、`neko-tools` 和 Engine/Agent/Assets 等横切能力。

## 模块职责

| 参与者                   | 职责                                                    |
| ------------------------ | ------------------------------------------------------- |
| `neko-cut`               | Timeline、剪辑、轨道、关键帧、导出编排                  |
| `neko-preview`           | 视频、音频、文档、全景等预览 provider 和 Webview        |
| `neko-canvas`            | 分镜、节点、创作结构、预览路线和叙事投影                |
| `neko-story`             | 剧本解析、场景/角色索引、叙事预览和 story-agent payload |
| `neko-tools`             | Media LSP、diff、诊断和工具面板                         |
| `neko-engine`            | 媒体探测、解码、编码、导出、流、质量分析                |
| Agent                    | 视频理解、分镜生成、自动后期建议、质量审阅              |
| Assets / Entity / Search | 素材、角色、场景、引用、索引和审阅 grounding            |

## 稳定边界

- 媒体探测、解码、编码、导出、diff 和流生产走 Engine。
- TypeScript 层不重写 Engine 已有媒体计算；只做编排、UI 状态和结果投影。
- Webview 消费授权后的 H.264/PCM/fMP4 stream client，不直接访问工作区文件。
- Extension Host 管 custom editor、resource URI、StatusBar、导出命令和 Engine 授权。
- Story/Canvas/Cut/Preview 之间通过共享 contract、asset/entity/search 引用连接，不直接 import 对方实现。
- 被动状态进入 native StatusBar，Timeline 和画布交互状态留在 Webview。

## 数据流

```text
Assets / Story / Canvas / Agent
  -> timeline or preview intent
  -> Extension authorization
  -> Engine probe / stream / diff / export
  -> Webview playback or result projection
  -> asset/entity/search/review grounding
```

## 历史 ADR 归并

- comic-to-animation、video understanding、AI video reference：归并到视频创作与 Agent 集成细则或 research。
- cut timeline assessment、media quality assessment：归入 status gap。
- viewport stream control、panoramic preview：与 Engine/Preview 交叉，稳定约束提升到 Engine 或本领域。
