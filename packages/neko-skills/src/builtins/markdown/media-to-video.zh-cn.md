# 媒体转视频协调器

通过聚焦的子 Skill 和现有工具协调媒体转视频任务。它不是固定流水线：只选择当前最小必要的子 Skill，并让面向用户的结论基于工具证据。

## 工作流指引

1. 先判断输入来源：漫画、文档、图片、图片序列、已审阅的分镜 creative table、Canvas 分镜节点、动画计划或已生成媒体。
2. 激活生产类 Skill 前先判断意图：
   - 仅内容理解（描述、OCR、总结、提取文字、分格顺序、人物/场景分析、质量诊断、“阅读/分析前 N 页”）应停留在普通读取/分析工具调用，不激活 media-to-video、comic-to-animation、comic-to-storyboard 或 storyboard-to-animation-plan。
   - 仅分镜请求激活 comic-to-storyboard，并在可审阅 Markdown creative table 完成后停止，除非用户同时要求动画、视频、生成媒体、Canvas/Cut 交接或导出。
   - 明确的视频/动画/生成/导出请求才激活本协调器或聚焦生产 Skill。
3. 用 GetContext 查看可用相关 Skill，只在需要详细规则时激活聚焦子 Skill。
4. EPUB/PDF/CBZ/CBR 漫画页只有在用户请求分镜 artifact 时才优先使用 comic-to-storyboard；用户明确请求动画/视频生产时优先使用 comic-to-animation。
5. 静态图片或图片序列在用户请求镜头/分镜规划或媒体生成时优先使用 image-to-shot。
6. 已有已审阅的分镜 creative table、Canvas 分镜节点或动画计划草稿时，在生成或进入 Cut 前优先使用 storyboard-to-animation-plan。
7. 将 AnimationPlan 视为按稳定 `shotId` 绑定的镜头级 overlay，不要把它当作第二张分镜表。缺少稳定 shot id 时，先停止并请求或修正稳定 id，再规划生成。
8. 已有动画计划 overlay 且目标是 Cut 时，优先使用 animation-plan-to-cut。
9. 已有生成素材时，根据需要使用 generated-shot-assembly 和 export-video-package。
10. 当缺少生成提供方、目标插件、审批或安全媒体引用时，停留在计划阶段。

## 结构化产物规则

- Markdown creative table 是可审阅的 authoring artifact。生产动画、Cut、生成媒体、导出或执行总结必须先调用可校验的 lifecycle capability，才能声称交付成功。
- 对 Markdown 表格做 Canvas 审阅时，使用运行时工具列表暴露的 Canvas lifecycle tool/capability，并由本地 UI/tool adapter 传递原始 Markdown 和稳定 resource ref。不要输出领域节点 JSON 或项目内部交接对象。有用的未知列应作为审阅 metadata 可见保留。
- 对 Cut、Sketch、Model 等项目文件的持久写入必须走 canonical authoring capability/command（例如 `neko.<domain>.authoring.*`），并携带明确 `target`、`reveal`、稳定 source/ref 和 provenance。不要把旧 UI-bound import 命令、打开编辑器或显示预览当成持久交付。
- 交互状态相关操作（播放、选择区、视口、相机、活动编辑器快照、实时预览）仍是 interactive-editor。缺少活动编辑器/运行时时应返回 typed diagnostic 并停止。
- authoring capability 返回 `ok:false` 或 diagnostics 时，要把诊断报告给用户；不能因命令调用没有抛错就声称发送成功。
- 已审阅的分镜 creative table 仍是创作镜头内容来源。AnimationPlan 只在 `shotOverlays[]` 中保存 provider-neutral 执行意图；运行状态属于 Agent async task 或 execution summary。
- 媒体引用必须来自真实 tool-result 或 generated-asset，不要编造 id。
- 不要嵌入 base64、blob URL、localhost URL 或绝对本地缓存路径。
- 不要检查 `.neko/.cache`、`.neko/semantic-index`、SQLite、FTS、vector store、scratch path、Webview URI 或 provider-private payload。聚焦 Skill 需要复用稳定来源范围的语义证据时，使用 QuerySemanticCoverage。
- 批量生成、上色、破坏性替换时间线或长时间导出前必须请求用户确认，除非用户明确要求自动执行且策略允许。

## 相关 Skill 选择

- comic-to-storyboard：读取漫画页、分格/OCR 证据，输出包含提示词、资源 token、review status 和 next action 的 Markdown creative table。
- image-to-shot：将静态图片引用转为镜头或分镜计划。
- storyboard-to-animation-plan：把分镜行转换为按镜头绑定的运动、镜头和生成 overlay 计划。
- animation-plan-to-cut：把动画计划转换为 Cut 时间线 payload。
- generated-shot-assembly：汇总已生成媒体引用。
- export-video-package：面向导出和交付的打包总结。

## 工具使用

当存在稳定 source ref 和 range 时，在昂贵的长范围分析前先使用 QuerySemanticCoverage。missing/stale 证据再通过 ReadDocument 和 ReadImage 获取。只有在用户确认后再使用生成工具。只有校验通过且目标能力存在时，才使用 Canvas/Cut 工具。
