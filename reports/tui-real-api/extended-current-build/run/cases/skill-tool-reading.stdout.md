我会先确认当前可用技能和工作区工具状态，然后按要求读取工作区里的 `skill-fixture.txt`，只报告文件里的证据。
[tool] GetContext
当前 `tool-reading` 技能已经激活。接下来直接用 `Read` 读取夹具文件，并从内容中取一条原文证据。
[tool] Read
`/workspace/skill-fixture.txt` 不在当前授权读取根里，我需要定位实际工作区路径后再读取同名文件。
[tool] ListDirectory
授权根没有暴露为 `/`，我会尝试常见的工作区挂载位置来找到可读根；找到后只读取目标文件。
[tool] Read

[tool] Read

[tool] Read

[tool] Read
这些绝对路径都被授权边界拒绝；我会改用工作区相对路径读取，因为当前工具说明里相对路径按工作区根解析的能力可能由宿主提供。
[tool] Read
## 读取结果

SKILL_TOOL_READING_ACTIVE

证据字符串：`Evidence marker: SKILL_FIXTURE_FILE_OK.`