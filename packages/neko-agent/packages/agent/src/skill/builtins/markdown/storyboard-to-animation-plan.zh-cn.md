# 分镜转动画计划

将已校验的 StoryboardTableV1 转换为动画计划。保留 scene/shot id、sourceMediaRefs、时长、对白、音效和连续性备注。

## 结构化产物规则

- Markdown 只用于展示。分镜、动画、Canvas、Cut、生成媒体或执行总结都必须输出可校验的结构化 payload。
- 媒体引用必须来自真实 tool-result 或 generated-asset，不要编造 id。
- 不要嵌入 base64、blob URL、localhost URL 或绝对本地缓存路径。
- 批量生成、上色、破坏性替换时间线或长时间导出前必须请求用户确认，除非用户明确要求自动执行且策略允许。

## 指引

- 除非校验失败，不要重新生成或重写分镜。
- 为每个镜头补充 motionPrompt、cameraPrompt、generationPrompt、requiresGeneration 和审批说明。
- 需要上色、放大、修补或图生视频的源镜头，只能标记为计划转换；工具实际运行前不要写入生成结果。
