# Skill Authoring

本文说明用户、项目、市场和插件 Skill 如何通过自描述 metadata 进入 Agent 可读 catalog。自然语言输入不再经过代码侧候选路由；Agent 会在需要时通过 `GetContext` 查看 registered Skills，并自主决定是否调用 `ActivateSkill`。

## Agent-readable metadata

`SKILL.md` 至少需要稳定的 `name` 和 `description`。如果希望 Agent 更准确地判断何时激活 Skill，推荐补充 `domain`、`referencedSkills` 和 `mediaWorkflow`：

```yaml
---
name: epub-character-index
description: Build a character index from EPUB chapters for story planning.
source: project
enabled: true
domain: story
allowedTools:
  - ReadDocument
mediaWorkflow:
  useCases:
    - Extract recurring characters from EPUB chapters
    - Build a CharacterIndex for story planning
  nonGoals:
    - Summarize an EPUB chapter without creating a character index
    - Generate images, video, or timeline assets
  acceptedModalities:
    - epub
    - document
  inputArtifacts:
    - EPUB
    - chapter-text
  producedArtifacts:
    - CharacterIndex
  tags:
    - epub
    - character
    - story
  operations:
    - extract-characters
    - build-character-index
  optionalTools:
    - QuerySemanticCoverage
  costLevel: low
  riskLevel: low
---
```

## 字段语义

- `description`：用于 Skill catalog 和 Agent 对能力的第一层理解。缺失描述会让 Agent 难以安全判断是否激活。
- `domain`：标明 Skill 所属领域，例如 `story`、`media`、`quality`。
- `useCases`：说明适合激活该 Skill 的典型请求，比在正文堆触发词更稳定。
- `nonGoals`：说明不应激活该 Skill 的场景，尤其是摘要、OCR、普通分析等非生产请求。
- `acceptedModalities` / `inputArtifacts`：说明输入类型，例如 `comic`、`epub`、`StoryboardTable`。
- `producedArtifacts`：说明输出产物，例如 `CharacterIndex`、`StoryboardTable`、`cut-storyboard-payload`。
- `operations`：用动词描述能力，例如 `extract-characters`、`create-storyboard`。
- `allowedTools` / `requiredSubpackages`：由激活 runtime 校验真实工具和子包边界；缺失时应 fail-visible，而不是静默降级。
- `referencedSkills`：声明编排 Skill 与聚焦 Skill 的关系，帮助 Agent 决定是否切换或激活更具体的 Skill。

## 激活边界

metadata 只帮助 Agent 理解 Skill。它不会自动激活 Skill，也不会注入 prompt、model override 或工具白名单。

合法激活路径只有：

- 用户输入 `$skill-name`。
- Webview 发送显式 `invokeSkill`。
- Agent 调用 `ActivateSkill`。

自然语言命中 metadata 后，Agent 可以继续普通回答、询问澄清问题，或在判断确实需要专业指导时调用 `ActivateSkill`。
