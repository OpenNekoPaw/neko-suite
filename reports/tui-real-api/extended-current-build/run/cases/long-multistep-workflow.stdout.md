我会按你给的四步走：先读源文件，再写报告文件，随后回读校验，最后汇总结果。
[tool] Read
`/workspace/long-source.md` 不在当前授权读取根里。我先定位当前可访问的项目目录，再继续读取同名文件。
[tool] ListDirectory
根目录也不可枚举，说明工具被限制在特定工作区根。接下来我用上下文工具确认当前可用范围或工作区信息。
[tool] GetContext
可用工具里包含读写能力，但没有暴露工作区根路径。现在我会尝试常见挂载点来找到授权目录；找到后继续执行写入和校验。
[tool] ListDirectory

[tool] ListDirectory

[tool] ListDirectory

[tool] ListDirectory
这些绝对路径都不在授权范围内。写入工具支持相对路径解析到工作区根，所以我改用相对路径读取源文件。
[tool] Read
已读到源文件，内容确认包含 `LONG_SOURCE_FIXTURE_OK` 和任务要求。接下来写入 `long-output.md`，包含标题、三条要点和报告标记。
[tool] Write
`long-output.md` 已写入。现在回读该文件，检查标题、三条要点和 `LONG_TASK_REPORT_OK` 是否都存在。
[tool] Read
## 总结

已完成多步骤长任务：

| 步骤 | 结果 |
|---|---|
| 读取 `long-source.md` | 成功，确认包含 `LONG_SOURCE_FIXTURE_OK` |
| 写入 `long-output.md` | 成功，已包含标题、三条要点和 `LONG_TASK_REPORT_OK` |
| 回读校验 `long-output.md` | 成功，内容符合要求 |

最终标记：`LONG_TASK_OK`、`LONG_SOURCE_FIXTURE_OK`、`LONG_TASK_REPORT_OK`。