# 漫画转动画

当用户希望把漫画、日漫、webtoon、EPUB、PDF、CBZ/CBR 或已有分镜产物转换为动画可用素材和视频装配计划时，使用这个聚焦入口。

这不是硬编码流水线。根据已校验 artifact、可用能力、用户审批和安全媒体引用，选择当前最小必要的子 Skill 或工具。除非对应工具返回成功，不要声称图片、视频、Canvas 交付、Cut 装配、语音或导出已经完成。

## 工作流指引

1. 如果还没有已校验分镜，先激活 `comic-to-storyboard`。
2. 如果已有包含 `domainKind: "StoryboardTable"` 的 `CompositeArtifact`，先校验它；除非诊断要求修复，不要重写分镜。
3. 准备动画时，必须有或派生一个可审阅的 `comic-shot-asset-prep` 投影，其底层是 `ShotImagePrepPlan`。
4. 批量图像准备、上色、去字、视频生成、TTS、破坏性 Cut 修改或导出前必须请求用户审批。
5. 只有存在 host 已解析的 source image URI/base64 时，才把源图绑定编辑路由到 `TransformImage`；stable ref 在 host IO 解析前只是 lineage metadata。
6. 新关键帧或重构关键帧走 `GenerateImage`，并尽量携带 source refs、角色 refs、场景 refs 和风格 refs。
7. 只有关键帧/源图引用来自真实 generated asset 或 host 已解析 image-to-video 输入时，才调用 `GenerateVideo` 生成动画片段。
8. 只有结构化 payload 校验通过且目标能力存在时，才发送到 Canvas 或 Cut。

## 结构化产物规则

- Markdown 只用于展示。分镜、镜头图像准备、动画计划、生成媒体引用、Canvas payload、Cut payload 和执行总结都必须是可校验结构化 payload。
- 当从漫画证据生成或修复分镜时，输出同一个 `CompositeArtifact`，其中同时包含 `StoryboardTable` domain block 和 `extensions["neko.entityMemoryContributionPayload"]`。贡献 payload 是机器可读的统一实体输入；审阅表只是可选的人类投影。
- 分镜和实体记忆保持独立但可互相引用。`StoryboardTable` 管理镜头顺序和镜头内人物出现；`EntityMemoryContribution` 管理可审阅的实体/候选证据。二者通过稳定 id 和 metadata 关联，不要把实体事实塞进 Canvas 或分镜的所有权里。
- 每个重复出现的分镜人物都要有稳定 `characterId`；同一视觉身份跨镜头复用同一个 id。优先使用 `story-char-rin` 这类 id，不要只依赖显示名。
- 每个可持久化人物候选/观察都要在 `EntityMemoryContribution.entityCandidates[].metadata`、`characterObservations[].extensions["neko.storyboardEntityMapping"]` 和/或 `characterObservations[].provenance.metadata` 中镜像分镜映射键：可用时填写 `storyboardCharacterId`、`characterId`、`shotId`、`shotNumber`、`characterIndex`、`sourceRef`。
- 映射键优先级为：`storyboardCharacterId`，其次 `shotId + characterId`，其次 provenance/source refs，最后才是 `name` fallback。同名人物或候选存在歧义时，不要自动合并；保留不同 candidate id，并写入 `candidate-ambiguous` 之类的 diagnostic。
- 使用 `entityCandidates[]` 表达可审阅统一实体。只有用户提供或源文本明确命名时才使用 `identityBasis: "user-named"`；仅凭视觉重复识别的人物使用 `identityBasis: "visual"`，不要声称可按名称匹配。
- 媒体引用必须来自真实 tool-result、generated-asset、canvas-node 或 workspace-safe ref，不要编造 id。
- 持久化 artifact 中不要嵌入 base64、blob URL、localhost URL、Webview URI、provider 临时句柄或绝对本地缓存路径。
- `StoryboardTable` 继续表达语义镜头计划；`ShotImagePrepPlan` 表达图像准备意图和状态；generated media refs 只表达工具真实输出。
- 当图像分析需要表达是否建议重生成分镜图时，写入 `ShotImagePrepPlan.metadata.regenerationRecommendation`。这只是审阅信号，不会自行批准或执行 GenerateImage/TransformImage。

## 分镜与实体输出契约

当用户请求 comic-to-animation 且尚无已校验分镜时，第一个持久输出仍应是分镜 artifact：

1. 输出一个 `neko-composite` JSON block，根对象是 `CompositeArtifact`。
2. 包含一个 `domain` block，`domainKind: "StoryboardTable"`，并放入合法嵌套的 StoryboardTable payload。
3. 只要提取到了可持久化人物证据，就在同一 artifact 的 `extensions["neko.entityMemoryContributionPayload"]` 中放入完整贡献 payload。
4. 每个 shot character 写入 `characterId`、`name`/`characterName`、镜头内 role/action/emotion，并在有证据时写入 `sourceMediaRefs` 或人物级 source metadata。
5. 贡献 payload 中的 `entityCandidates[]` 和/或 `characterObservations[]` 必须引用与分镜人物一致的 source refs 和映射键。
6. 可以额外添加 `profile: "character-memory-review"` 的 review-only `GenericTable` 供人审阅，但不能替代 contribution extension。
7. 如果输出“主要角色观察”“角色与关系变化”或任何角色分析表，必须同步镜像为 `extensions["neko.entityMemoryContributionPayload"]`；无法构造完整贡献 payload 时，把表格标注为非持久分析。

最小映射示例：

```neko-composite
{
  "schemaVersion": 1,
  "kind": "composite-artifact",
  "artifactId": "comic-animation-plan",
  "profile": "comic-to-animation-plan",
  "title": "Comic Animation Plan",
  "extensions": {
    "neko.entityMemoryContributionPayload": {
      "contributionId": "comic-page-1-character-memory",
      "sourcePackage": "neko-agent",
      "sourceRef": { "kind": "tool-result", "toolCallId": "read-doc-call-id", "assetIndex": 0 },
      "reviewPolicy": "requires-user-review",
      "entityCandidates": [
        {
          "id": "candidate-story-char-rin",
          "kind": "character",
          "name": "Rin",
          "status": "open",
          "identityBasis": "user-named",
          "confidence": 0.82,
          "provenance": [
            {
              "providerId": "neko-agent",
              "sourceKind": "agent",
              "sourceRef": "read-doc-call-id#asset-0#panel-P1",
              "label": "story-char-rin",
              "confidence": 0.82,
              "metadata": {
                "storyboardCharacterId": "story-char-rin",
                "shotId": "scene-1-shot-1",
                "shotNumber": 1,
                "characterIndex": 0
              }
            }
          ],
          "sourceRefs": ["read-doc-call-id#asset-0#panel-P1"],
          "metadata": {
            "storyboardCharacterId": "story-char-rin",
            "characterId": "story-char-rin",
            "sourceRef": "read-doc-call-id#asset-0#panel-P1"
          }
        }
      ],
      "characterObservations": [
        {
          "observationId": "obs-story-char-rin-shot-1",
          "sourceRef": {
            "kind": "tool-result",
            "toolCallId": "read-doc-call-id",
            "assetIndex": 0,
            "range": { "shotId": "scene-1-shot-1", "panelId": "P1" }
          },
          "provenance": {
            "source": "comic",
            "providerId": "neko-agent",
            "toolCallId": "read-doc-call-id",
            "metadata": {
              "storyboardCharacterId": "story-char-rin",
              "shotId": "scene-1-shot-1",
              "shotNumber": 1,
              "characterIndex": 0
            }
          },
          "reviewStatus": "needs-review",
          "candidateId": "candidate-story-char-rin",
          "mention": {
            "mentionId": "mention-story-char-rin-shot-1",
            "kind": "visual",
            "candidateName": "Rin",
            "confidence": 0.82
          },
          "dimensions": [
            {
              "dimension": "appearance",
              "value": "只写当前来源支持的视觉特征",
              "confidence": 0.82
            }
          ],
          "confidence": 0.82,
          "extensions": {
            "neko.storyboardEntityMapping": {
              "storyboardCharacterId": "story-char-rin",
              "shotId": "scene-1-shot-1",
              "shotNumber": 1,
              "characterIndex": 0,
              "sourceRef": "read-doc-call-id#asset-0#panel-P1"
            }
          }
        }
      ]
    }
  },
  "blocks": [
    {
      "blockId": "storyboard-domain",
      "kind": "domain",
      "title": "Storyboard Payload",
      "domainKind": "StoryboardTable",
      "schemaVersion": 1,
      "payload": {
        "schemaVersion": 1,
        "kind": "storyboard-table",
        "profile": "manga-to-video",
        "title": "Storyboard",
        "scenes": [
          {
            "sceneId": "scene-1",
            "sceneTitle": "Page 1",
            "shots": [
              {
                "shotId": "scene-1-shot-1",
                "shotNumber": 1,
                "duration": 3,
                "visualDescription": "Panel action and composition",
                "sourceMediaRefs": [
                  {
                    "refId": "source-panel-1",
                    "role": "source",
                    "locator": {
                      "type": "tool-result",
                      "toolCallId": "read-doc-call-id",
                      "assetIndex": 0
                    },
                    "label": "Page 1 / Panel 1",
                    "mimeType": "image/jpeg"
                  }
                ],
                "characters": [
                  {
                    "characterId": "story-char-rin",
                    "name": "Rin",
                    "role": "primary",
                    "action": "Visible action",
                    "emotion": "visible emotion"
                  }
                ],
                "characterAction": "Visible action",
                "imageStrategy": "use-as-reference"
              }
            ]
          }
        ]
      }
    }
  ]
}
```

## 必要交接

- 漫画证据和 OCR：`comic-to-storyboard`。
- 运动、镜头、图片/视频提示词、连续性和生成准备：`storyboard-to-animation-plan`。
- 源分格清理、inpaint/outpaint、上色、放大、风格统一：`comic-shot-asset-prep` + `TransformImage`。
- 缺失/重构关键帧和参考设定图：`GenerateImage`。
- 重生成建议展示：`ShotImagePrepPlan.metadata.regenerationRecommendation` 和 `comic-shot-asset-prep` 审阅表。
- 图生视频或文生视频片段：`GenerateVideo`。
- 时间线装配：`animation-plan-to-cut`。
- 生成素材汇总：`generated-shot-assembly`。
- 交付校验：`export-video-package`。

## 动画计划结构

输出动画计划时，将它放入 `CompositeArtifact` 的 domain block：

```json
{
  "kind": "domain",
  "domainKind": "AnimationPlan",
  "schemaVersion": 1,
  "payload": {
    "kind": "animation-plan",
    "sourceStoryboardRef": "artifact-or-storyboard-id",
    "shots": [
      {
        "sceneId": "scene-1",
        "shotId": "scene-1-shot-1",
        "duration": 3,
        "motionPrompt": "角色小幅动作和环境运动",
        "cameraPrompt": "中景平视，缓慢推进",
        "generationPrompt": "基于来源引用的视频关键帧提示词",
        "requiresImagePrep": true,
        "requiresVideoGeneration": true,
        "sourceMediaRefs": [],
        "preparedKeyframeRefs": [],
        "referenceBundle": {},
        "dialogueCueRefs": [],
        "voiceCueRefs": [],
        "approvalNotes": "图像准备和视频生成前需要用户审批。"
      }
    ],
    "diagnostics": []
  }
}
```

只输出证据支持的字段。当说话者绑定、图片引用、mask、角色身份、场景身份、provider 能力或成本估算缺失时，用 diagnostics 标注，不要猜测。
