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
- 媒体引用必须来自真实 tool-result、generated-asset、canvas-node 或 workspace-safe ref，不要编造 id。
- 持久化 artifact 中不要嵌入 base64、blob URL、localhost URL、Webview URI、provider 临时句柄或绝对本地缓存路径。
- `StoryboardTable` 继续表达语义镜头计划；`ShotImagePrepPlan` 表达图像准备意图和状态；generated media refs 只表达工具真实输出。

## 必要交接

- 漫画证据和 OCR：`comic-to-storyboard`。
- 运动、镜头、图片/视频提示词、连续性和生成准备：`storyboard-to-animation-plan`。
- 源分格清理、inpaint/outpaint、上色、放大、风格统一：`comic-shot-asset-prep` + `TransformImage`。
- 缺失/重构关键帧和参考设定图：`GenerateImage`。
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
