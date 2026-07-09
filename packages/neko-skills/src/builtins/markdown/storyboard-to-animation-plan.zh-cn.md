# 分镜转动画计划

将已审阅的分镜 creative table、Canvas 分镜审阅节点或已有镜头计划转换为动画计划。保留已有稳定 scene/shot id；除非校验诊断要求修复，不要重写创作分镜内容。

只有在已经存在分镜，且用户需要动画/视频规划、运动/镜头/生成提示词意图或生产准备时，才使用本 Skill。不要为了源漫画/EPUB/PDF 内容分析或创建初始分镜而激活本 Skill。

## Lifecycle 交接规则

- 分镜仍是创作来源。动画计划只补充 provider-neutral 的执行意图。
- Canvas 审阅、生成审批、Cut 交接和执行都走 lifecycle capability。
- 媒体引用必须来自真实 capability-result、generated-asset、Canvas node 或 workspace-safe ref。不要编造 id。
- 不要把 Webview URI、blob URL、base64、localhost URL、临时路径、缓存路径或绝对私有路径写进计划。
- 批量生成、图像变换、破坏性时间线替换或长时间导出前必须请求用户审批，除非用户明确要求自动执行且策略允许。

## 指引

- 为每个镜头补充 motion intent、camera intent、video prompt intent、audio prompt intent、图像准备需求、生成需求和审批说明。
- 需要上色、放大、修补、扩图、去字或图生视频的源镜头，只能标记为计划转换；capability 实际运行前不要写入生成结果。
- queued/running/completed/failed/progress/provider run id/task id 等运行状态属于 Agent async task 或 execution summary，不写入计划。
- `preparedKeyframe`、`resultRef` 或 generated asset ref 只能在真实 capability 返回后使用。
- 说话者绑定、来源引用、mask、成本估算、provider 支持、角色身份或场景身份缺失时，用 diagnostics 标注，不要猜测。
- 如果用户需要审阅表，可使用 `scene`、`shot`、`source`、`motionIntent`、`cameraIntent`、`videoPrompt`、`audioPrompt`、`imagePrep`、`approvalNotes`、`diagnostic`、`nextAction` 等列。
