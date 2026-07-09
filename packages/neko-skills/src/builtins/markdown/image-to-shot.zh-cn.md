# 图片转镜头

将一张或多张静态图片转换为可审阅的镜头计划表。按运行时 perception/content 能力说明检查图片，描述可见证据；当用户需要分镜或镜头规划时，输出 Markdown creative table。

## Lifecycle 交接规则

- Markdown 表格是审阅界面。Canvas、生成、Cut 或导出交接必须走 lifecycle capability。
- 媒体引用使用稳定 resource token 或 host 提供的 resource ref。不要编造 id，也不要依赖聊天附件顺序。
- 不要把 Webview URI、blob URL、base64、localhost URL、临时路径、缓存路径或绝对私有路径写进 Markdown。
- 生成、上色、破坏性时间线修改或长时间导出前必须请求用户审批，除非用户明确要求自动执行且策略允许。

## 指引

- 先描述可见证据，再规划镜头。
- 图片序列默认保持输入顺序，除非用户要求重排。
- 如果一张图包含多个可用节拍，可以创建多行并复用同一个 `source` token，用 `sourcePanel` 区分裁切或分格。
- 分镜表使用与 comic-to-storyboard 相同、支持提示词槽的表头。主字段优先使用 `scene`, `shot`, `source`, `imagePrompt`, `videoPrompt`, `duration`, `dialogue`。
- 聊天输出必须包含 `scene` + `shot`，并且包含 `source`，或至少一个提示词槽；有用的开放审阅 metadata 列可以保留。
- `imagePrompt` 用于所有图像生成、图像编辑、重绘和局部重绘/扩图（inpaint/outpaint）意图；`videoPrompt` 只用于 scene 级视频生成/编辑意图。新的输出不要写 shot 级或单镜视频提示词；shot 动作应作为 scene 级 `videoPrompt` 的顺序节拍。`nextAction` 只是计划文本，不是执行动作。
- 资源引用必须说明用途。不要只写 `P1`、`P2` 或 `@character` / `@角色`；提示词里要说明它们是首帧、构图参考、人物形象、场景背景、动作、运镜、音效、对白或风格参考。Markdown 表格的资源身份仍由 `source` 列承担。
- `imagePrompt` 生成写“主体与人物外观 / 场景地点 / 构图与镜头 / 风格色彩光影 / 参考一致性约束”；编辑写“输入资源 / 保留内容 / 修改目标 / 有序步骤 / 输出约束”，步骤要明确裁切、旋转、去文字、补全、上色、重绘、扩图、放大或统一风格。
- `videoPrompt` 写 scene 级“场景意图 / 参考资源用途 / 主体人物与情绪 / 场景环境 / 按镜号或时间段排列的动作节拍 / 运镜连接 / 环境变化或特效 / 对白、音效或无对白 / 总时长 / 约束”。长 scene 或 10 秒以上意图优先分时段描述。
- 每个非空提示词都必须能回答“用哪个参考、做什么、主体是谁、在哪里、怎么运动或变化、镜头怎么拍、持续多久、保留/禁止什么”；答不出来就留空，并用 `nextAction` 说明需要补充视觉分析或提示词优化。
- 需要时追加 `sourcePanel`、`decision`、`decisionReason`、`referenceImage`、`styleRef`、`requiresSplit`、`requiresInpaint`、`requiresOutpaint`、`contentType`、`nextAction` 或 `risk` 等扩展列。
- 默认不要添加状态列。状态属于 Canvas 审阅状态、Agent 异步任务或执行总结，不属于主镜头计划表。
- 生成 capability 返回结果前，不要声称图片或视频已经生成。
