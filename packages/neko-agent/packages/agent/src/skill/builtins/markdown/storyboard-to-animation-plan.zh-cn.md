# 分镜转动画计划

将已校验的、包含 StoryboardTable domain block 的 CompositeArtifact，或旧裸 StoryboardTable，转换为动画计划。保留 scene/shot id、sourceMediaRefs、时长、对白、音效和连续性备注。

## 结构化产物规则

- Markdown 只用于展示。分镜、动画、Canvas、Cut、生成媒体或执行总结都必须输出可校验的结构化 payload。
- 媒体引用必须来自真实 tool-result 或 generated-asset，不要编造 id。
- 不要嵌入 base64、blob URL、localhost URL 或绝对本地缓存路径。
- 批量生成、上色、破坏性替换时间线或长时间导出前必须请求用户确认，除非用户明确要求自动执行且策略允许。

## 指引

- 如果输入是 CompositeArtifact，从 `domainKind: "StoryboardTable"` block 读取 StoryboardTable。
- 除非校验失败，不要重新生成或重写分镜。
- 为每个镜头补充 motionPrompt、cameraPrompt、generationPrompt、requiresGeneration 和审批说明。
- 需要上色、放大、修补或图生视频的源镜头，只能标记为计划转换；工具实际运行前不要写入生成结果。
- 输出动画计划时，使用 `CompositeArtifact` domain block：`domainKind: "AnimationPlan"`，`payload.kind: "animation-plan"`。
- 保留分镜中的 sceneId、shotId、镜头顺序、sourceMediaRefs、generatedMediaRefs、textCues、voiceCues、角色引用、场景引用、时长和诊断。
- `preparedKeyframeRefs` 只能引用真实生成或转换后的关键帧。计划阶段引用使用 `sourceMediaRefs` 或 `referenceBundle`。
- 当 `imageStrategy` 表示 `transform-original`、源图清理、去字、上色、扩图、放大或风格统一时，设置 `requiresImagePrep`。
- 只有用户需要动画片段，而不是静态分镜或 Cut 草稿时，才设置 `requiresVideoGeneration`。
- 说话者绑定、来源引用、mask、成本估算、provider 支持、角色身份或场景身份缺失时，用 diagnostics 标注，不要猜测。

## AnimationPlan Domain Payload

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
        "shotNumber": 1,
        "duration": 3,
        "motionPrompt": "角色小幅动作和环境运动",
        "cameraPrompt": "中景平视，缓慢推进",
        "generationPrompt": "基于来源引用的视频提示词",
        "requiresImagePrep": true,
        "requiresVideoGeneration": true,
        "sourceMediaRefs": [],
        "preparedKeyframeRefs": [],
        "referenceBundle": {},
        "textCueRefs": [],
        "voiceCueRefs": [],
        "approvalNotes": "图像准备和视频生成前需要用户审批。"
      }
    ],
    "diagnostics": []
  }
}
```
