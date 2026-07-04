# 图片转镜头

将一张或多张静态图片转换为可审阅的镜头计划表。先用 ReadImage 检查图片，描述可见证据；当用户需要分镜或镜头规划时，输出 Markdown creative table。

## Lifecycle 交接规则

- Markdown 表格是审阅界面。Canvas、生成、Cut 或导出交接必须走 lifecycle capability。
- 媒体引用使用稳定 resource token 或 host 提供的 resource ref。不要编造 id，也不要依赖聊天附件顺序。
- 不要把 Webview URI、blob URL、base64、localhost URL、临时路径、缓存路径或绝对私有路径写进 Markdown。
- 生成、上色、破坏性时间线修改或长时间导出前必须请求用户审批，除非用户明确要求自动执行且策略允许。

## 指引

- 先描述可见证据，再规划镜头。
- 图片序列默认保持输入顺序，除非用户要求重排。
- 如果一张图包含多个可用节拍，可以创建多行并复用同一个 `source` token，用 `sourcePanel` 区分裁切或分格。
- 分镜表使用与 comic-to-storyboard 相同、支持提示词槽（prompt slot）的表头：`scene`, `shot`, `source`, `sourcePanel`, `decision`, `duration`, `visual`, `motion`, `audio`, `characters`, `dialogue`, `imagePrompt`, `imageEditPrompt`, `shotVideoPrompt`, `videoEditPrompt`, `sceneStylePrompt`, `sceneVideoPrompt`, `sceneVideoEditPrompt`, `reviewStatus`, `nextAction`, `contentType`, `decisionReason`, `requiresSplit`, `duplicateOf`。
- 聊天输出必须包含 `scene` + `shot`，并且包含 `source`，或至少一个提示词槽 / 兼容字段 `prompt`；有用的开放审阅 metadata 列可以保留。
- `imagePrompt` 用于单镜头图像生成，`imageEditPrompt` 用于图像编辑/重绘/inpaint，`shotVideoPrompt` 用于单镜头视频生成，`videoEditPrompt` 用于单镜头视频编辑，`sceneStylePrompt` 用于场景图像/风格连续性，`sceneVideoPrompt` 用于场景视频生成，`sceneVideoEditPrompt` 用于场景视频编辑。`nextAction` 只是计划文本，不是执行 action。
- 需要时追加 `decisionReason`、`referenceImage`、`styleRef`、`requiresInpaint`、`requiresOutpaint` 或 `risk` 等扩展列。
- 生成工具返回结果前，不要声称图片或视频已经生成。
