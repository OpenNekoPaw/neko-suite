# 漫画转动画

当用户希望把漫画、日漫、webtoon、EPUB、PDF、CBZ/CBR、分镜 creative table 或图片序列转换为动画准备计划、媒体生成指导和视频装配步骤时，使用这个聚焦入口。

这不是硬编码流水线。根据已审阅 artifact、可用能力、用户审批和安全媒体引用，选择当前最小必要的 Skill 或 lifecycle capability。除非对应工具/capability 返回成功，不要声称图片、视频、Canvas 交付、Cut 装配、语音或导出已经完成。

## 工作流指引

1. 先判断意图：
   - 仅内容理解（描述、OCR、分格顺序、人物/场景分析、质量诊断）是内容分析，不是 comic-to-animation 生产运行。
   - 仅分镜（例如“生成/制作分镜表”）应停在 `comic-to-storyboard`，除非用户同时要求动画、视频、批量处理、Canvas/Cut 交付、素材准备或导出。
   - 动画/视频/批量生产请求才激活本 Skill，并开始生产编排。
2. 用户请求生产时，先创建或更新用户可见的任务计划，再执行生成类工作。默认任务应稳定且可恢复，例如：读取来源页、分析分格/OCR、草拟分镜 creative table、审阅分镜、派生镜头图像准备、审批图像准备、执行已批准图像准备、草拟动画计划、审批视频生成、执行视频生成、装配 Cut/导出。
3. 默认只自动运行低风险、只读或产出草稿的任务：来源读取、语义覆盖检查、OCR/分格分析、分镜草稿、图像准备计划派生和动画计划草稿。
4. 创作真值确认、实体身份合并、破坏性或高成本媒体变换、视频/TTS 生成、Cut 替换和导出必须停在审批门。
5. 如果还没有已审阅分镜，先激活 `comic-to-storyboard`，输出包含资源 token、提示词、review status 和 next action 的 Markdown creative table。
6. 不要在每个生产步骤重新生成分镜。只有分格检测、OCR/对白含义、shot 拆分/合并/顺序、人物身份或剧情理解变化时，才修订分镜。
7. 长篇漫画/文档/视频/音频需要重新分析前，若存在稳定 source ref 和 range，先调用 QuerySemanticCoverage。fresh matched ranges 作为上下文复用，只对 missing 或 stale 范围继续调用工具分析。
8. 如果没有稳定 source ref，继续正常工具分析，并写明该输入无法复用语义覆盖。
9. 派生图像准备工作前，必须审计每个漫画 source image/page：图片方向、分格边界、一页到多 shot 的映射、文字/音效字清理、缺失背景或边缘、inpaint 补全、outpaint 扩图、黑白转彩色、放大和风格统一。
10. 只有存在 host 已解析的 source image URI/base64 时，才把源图绑定编辑路由到 TransformImage；stable ref 在 host IO 解析前只是 lineage metadata。
11. 新关键帧或重构关键帧走 GenerateImage，并尽量携带 source refs、角色 refs、场景 refs 和风格 refs。
12. 只有关键帧/源图引用来自真实 generated asset 或 host 已解析 image-to-video 输入时，才调用 GenerateVideo 生成动画片段。
13. 只有校验通过且目标能力存在时，才发送到 Canvas 或 Cut。

## Lifecycle Artifact 规则

- Markdown creative table 是可审阅的 authoring artifact。Canvas ingest、生成、Cut、导出和执行交接应走 lifecycle capability 或聚焦领域工具。
- 对 Markdown 表格做 Canvas 审阅时，使用运行时工具列表暴露的 Canvas lifecycle tool/capability，并按需传递原始 Markdown 和稳定 resources。
- 不要输出领域节点 JSON、项目内部交接对象、Webview URI、blob URL、localhost URL、provider 临时句柄、缓存路径、临时路径或绝对私有路径。
- 媒体引用必须来自真实 tool-result、generated-asset、Canvas node 或 workspace-safe ref，不要编造 id。
- 分镜、动画计划、图像准备计划、实体证据、生成媒体引用和执行总结应保持独立，但通过稳定 shot/source id 交叉引用。
- 实体记忆和人物证据由对应的实体/contribution 流程拥有。本 Skill 展示人物观察时，除非调用了可信 contribution capability，否则只标注为审阅证据。
- 角色身份、来源引用、mask、成本估算、provider 支持、场景身份或说话者绑定不确定时，用 diagnostics 标注，并保持计划可审阅。

## 审阅表格

需要输出用户可见计划时，优先使用紧凑 Markdown 表格：

- 分镜：使用 comic-to-storyboard 的 creative table 表头。
- 图像准备：可用 `scene`、`shot`、`source`、`operation`、`reason`、`prompt`、`maskNeeded`、`reviewStatus`、`nextAction`。
- 动画计划：可用 `scene`、`shot`、`motionIntent`、`cameraIntent`、`videoPrompt`、`audioPrompt`、`requiresImagePrep`、`requiresVideoGeneration`、`approvalNotes`、`reviewStatus`、`nextAction`。
- 执行总结：可用 `step`、`target`、`status`、`resultRef`、`diagnostic`、`nextAction`。

未知列可以作为审阅 metadata 保留，但可执行 action 必须映射到可信 lifecycle capability 或真实工具。

## 图像准备指引

- 一张来源图可以生成多个 storyboard shot 和多行图像准备记录。来自同一页/同一图的行必须保留相同 source token/ref，并用 `sourcePanel`、`decisionReason` 或 `imageAudit` 标明 panel 身份。
- 图像处理需求只作为计划/审阅数据表达：`rotate`、`split-panels`、`remove-text`、`inpaint`、`outpaint`、`colorize`、`upscale` 和 `style-normalize`。
- 工具真实返回前，不要声称已经存在旋转、裁切、上色、补全、扩图或生成后的图片。
- 图像分析建议重生成时，把它表达为审阅建议；它不会自行批准或执行 GenerateImage/TransformImage。

## 工具使用

- 缺少视觉证据时使用 ReadDocument/ReadImage。
- QuerySemanticCoverage 只用于复用带稳定 source ref 的语义证据，不能替代视觉分析。
- GenerateImage、TransformImage、GenerateVideo、TTS、Canvas、Cut 和导出工具只能在校验和审批要求满足后使用。
