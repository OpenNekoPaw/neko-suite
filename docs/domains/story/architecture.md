# 剧本创作领域架构

更新日期：2026-06-17

剧本创作领域以剧本文本和叙事语义为权威。`neko-story` 负责解析、索引、语言服务和准备度投影；Canvas、Video、Agent 只消费稳定的 scene/shot/character 语义，不复制剧本文本真值。

## 模块职责

| 参与者               | 职责                                                         |
| -------------------- | ------------------------------------------------------------ |
| `neko-story`         | 剧本文本、parser、LSP、场景索引、叙事预览和 Agent 上下文入口   |
| `neko-canvas`        | 管理已接受的 storyboard/画面节点、候选图、版本和执行摘要       |
| `neko-cut`           | 消费 story/timeline 转换结果，承接剪辑和导出                  |
| Agent                | 生成分镜建议、素材需求、角色/场景准备度解释和修复建议          |
| Assets/Entity/Search | 角色、场景、参考图、缩略图和 grounding 引用                   |

## 稳定边界

- 剧本文本、AST、sceneId 和角色/场景索引由 `neko-story` 拥有。
- `neko-story` 不拥有分镜表产物、分镜表预览页面或 ShotNode 编辑状态。
- Agent 根据剧本文本、场景索引、角色索引和用户目标自主判断预处理步骤，输出候选分镜、素材需求、诊断或视频创作计划。
- Canvas 管理用户接受后的结构化 storyboard 产物和执行摘要，不成为第二份剧本数据源。
- Video 时间线可以由 Story 转换生成，但剪辑、轨道、关键帧和导出真值归视频领域。
- 角色形象、Live2D/Puppet、2D/3D 场景和图像素材通过 Assets/Entity/Search 或领域格式引用。
- Agent 通过能力契约读写结构化意图，不直接耦合 Story Webview 或 Canvas Webview 实现。

## 数据流

```text
script text
  -> parser / script index
  -> Agent preflight / suggestions / storyboard candidates
  -> accepted canvas nodes / video timeline / asset requirements
```

## 格式边界

- 剧本文本格式保留 `.story`、`.fountain` 和 story 包内现有脚本入口。
- `.nks` 属于图像创作，不作为 Story 格式名扩展。
- Story 输出 scene/shot/character 语义引用，具体图像、场景、角色和视频真值分别归 `.nks`、`.nkm`、`.nkp` 和视频项目。
