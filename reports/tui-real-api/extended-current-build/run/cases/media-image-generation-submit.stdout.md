我先检查当前运行时暴露的工具，确认图片生成入口名称和参数。
[tool] GetContext
当前工具清单里有 AI generation 分类，但可调用工具列表没有展开到具体的 `GenerateImage`。这个请求是明确的图片生成提交，我尝试激活对应生成能力，看运行时是否补充该工具。
[tool] ActivateSkill
无法提交图片生成任务：当前运行时没有暴露可调用的 `GenerateImage` 工具，激活 `ai-generate` 技能也失败，返回 `Skill "ai-generate" not found`。

因此我不能伪造已提交状态或 `taskId`。当前结果：`taskId: 未生成`。