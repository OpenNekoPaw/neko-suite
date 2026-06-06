# 媒体转视频协调器

通过聚焦的子 Skill 和现有工具协调媒体转视频任务。它不是固定流水线：只选择当前最小必要的子 Skill，并让面向用户的结论基于工具证据。

## 工作流指引

1. 先判断输入来源：漫画、文档、图片、图片序列、包含 StoryboardTable domain block 的 CompositeArtifact、旧裸 StoryboardTable、动画计划或已生成媒体。
2. 用 GetContext 查看可用相关 Skill，只在需要详细规则时激活聚焦子 Skill。
3. EPUB/PDF/CBZ/CBR 漫画页优先使用 comic-to-storyboard。
4. 静态图片或图片序列优先使用 image-to-shot。
5. 已有包含 StoryboardTable domain block 的 CompositeArtifact，或旧裸 StoryboardTable 时，在生成或进入 Cut 前优先使用 storyboard-to-animation-plan。
6. 已有动画计划且目标是 Cut 时，优先使用 animation-plan-to-cut。
7. 已有生成素材时，根据需要使用 generated-shot-assembly 和 export-video-package。
8. 当缺少生成提供方、目标插件、审批或安全媒体引用时，停留在计划阶段。

## 结构化产物规则

- Markdown 只用于展示。分镜、动画、Canvas、Cut、生成媒体或执行总结都必须输出可校验的结构化 payload。
- 媒体引用必须来自真实 tool-result 或 generated-asset，不要编造 id。
- 不要嵌入 base64、blob URL、localhost URL 或绝对本地缓存路径。
- 批量生成、上色、破坏性替换时间线或长时间导出前必须请求用户确认，除非用户明确要求自动执行且策略允许。

## 相关 Skill 选择

- comic-to-storyboard：读取漫画页、分格/OCR 证据、输出包含 StoryboardTable domain block 的 CompositeArtifact。
- image-to-shot：将静态图片引用转为镜头或分镜计划。
- storyboard-to-animation-plan：把分镜行转换为运动、镜头和生成计划。
- animation-plan-to-cut：把动画计划转换为 Cut 时间线 payload。
- generated-shot-assembly：汇总已生成媒体引用。
- export-video-package：面向导出和交付的打包总结。

## 工具使用

用 ReadDocument、ReadImage 或 ReadDocumentImage 获取证据。只有在用户确认后再使用生成工具。只有结构化 payload 校验通过且目标能力存在时，才使用 Canvas/Cut 工具。
