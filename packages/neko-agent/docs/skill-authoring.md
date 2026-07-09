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
  profileReferences:
    - kind: artifact
      relationship: produces
      profileId: studio.character-index
      versionRange: ">=1"
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
- `profileReferences`：声明 Skill 消费、产出、要求或偏好的 shared profile id。Skill 可以与 profile 同包分发，但 durable artifact/creation/provider expression profile 仍要先作为独立 contribution 注册。
- `mediaWorkflow.artifactProfiles`：仍兼容旧 shorthand，会被规范化为 `relationship = "produces"` 的 Artifact Profile reference；新 Skill 推荐使用 `profileReferences` 表达 kind、relationship 和版本约束。
- `operations`：用动词描述能力，例如 `extract-characters`、`create-storyboard`。
- `allowedTools` / `optionalTools` / `requiredSubpackages`：机器可读 metadata，由激活 runtime 校验真实工具、能力目录和子包边界；缺失时应 fail-visible，而不是静默降级。
- `referencedSkills`：声明编排 Skill 与聚焦 Skill 的关系，帮助 Agent 决定是否切换或激活更具体的 Skill。

## Prompt content 边界

Skill Markdown 正文只描述扩展能力、领域方法论、创作语义、任务判断、输出风格和提示词写作规则。它不应该包含具体工具名教程、命令名、参数表、轮询/任务协议、UI 命令流程、缓存/Webview/path 协议或子包 authoring 细节。

这些信息的归属是：

- 系统提示词：默认 Agent 行为、通用工具协议、Markdown/引用/视觉证据、安全边界和失败处理。
- 子包 capability prompt / tool schema：领域工具、operation 名称、参数 schema、validation、diagnostics、资源绑定、authoring lifecycle 和能力目录。
- Skill frontmatter metadata：`allowedTools`、`optionalTools`、`profileReferences`、`operations`、`inputArtifacts`、`producedArtifacts` 等机器可读提示。
- Skill Markdown 正文：领域方法、创作语义、输出标准和示例，不承担运行时协议。

新增或修改 Skill 时，应维护防回流测试，确保正文没有重新包含系统提示词或子包 capability 拥有的工具协议。

## 激活边界

metadata 只帮助 Agent 理解 Skill。它不会自动激活 Skill，也不会注入 prompt、model override 或改变 tool policy。

Profile metadata 也不会在注册时直接注入提示词。运行时只在 Agent turn assembly 阶段，根据 active Skill、selected Creation Profile、resolved Artifact Profile、provider/model expression profile、policy 和 context budget 组合 prompt/schema/tool-policy。未知 profile id、版本不兼容或 host/trust 不满足时会产生可见 diagnostic。

合法激活路径只有：

- 用户输入 `$skill-name`。
- Webview 发送显式 `invokeSkill`。
- Agent 调用 `ActivateSkill`。

自然语言命中 metadata 后，Agent 可以继续普通回答、询问澄清问题，或在判断确实需要专业指导时调用 `ActivateSkill`。

## 生命周期、槽位与清理

激活后的 Skill 会成为会话内的生命周期记录，而不是直接成为一段需要手工拼接/拆除的 prompt。运行时会在每轮请求前从这些记录投影出 prompt、工具策略、模型覆盖和 UI 指示器。

当前运行时槽位包括：

- `domainSkill`：用户 `$skill-name`、Webview `invokeSkill`、Agent `ActivateSkill` 的默认槽位。默认同一时间只有一个，可由用户或 Agent 清理。
- `stagePersona`：Agent creation stage 人格槽位，由运行时根据当前 profile/stage 创建和清理；通常锁定，用户不能手工清除。
- `referenceSkill`：参考型指导槽位，可多记录共存，适合后续用于只读背景指导。
- `ephemeralSkill`：回合级临时槽位，运行时在回合结束后清理。
- `promptChainSkill`：Skill 方法指导槽位，用于 prompt-chain guidance，不代表可执行 workflow。
- `workflowSkill`：旧别名，只能作为 legacy trace 兼容语义；新 Skill 作者应使用 `promptChainSkill`/method guidance 表达。

Skill 作者不要在 `SKILL.md` 中假设自己总是唯一活跃 Skill，也不要依赖清理时反向撤销上一轮 prompt。`allowedTools` 应描述该 Skill 自身需要的最小工具集合，但只作为 metadata/policy 输入；多个 Skill 共存时，运行时会按生命周期策略组合或拒绝冲突，不能靠某个 Skill 声明来扩大更高优先级的 Plan Mode、审批模式、workspace trust 或 IDC 阶段限制。

现阶段 Skill frontmatter 不声明默认 `slot`、`lifetime` 或 `clearable`。这些由激活来源和运行时策略决定：

- 显式用户/Agent 激活通常是 `domainSkill` + `conversation untilCleared`。
- Agent stage persona 是 `stagePersona` + stage/profile lifetime；`idc-stage` 只表示默认 IDC profile 的 legacy/default 兼容语义。
- Prompt-chain 方法指导是 `promptChainSkill`，不是 workflow/run 执行记录。

如果未来允许 manifest 声明生命周期偏好，也必须先经过运行时策略校验；未知槽位、锁定记录清理、同名多记录清理和工具/model 冲突都应 fail-visible。

## Profile 分发

Profile 可以随 Skill package 分发，也可以通过 profile-only package 单独分发。后者适合共享工作室标准表结构、creation lifecycle 或 provider/model expression guidance，而不需要附带一个假 Skill。profile-only package 只进入 profile catalog，不会成为可激活 Skill。

Skill-local profile 只能用于非持久、非共享的临时 reasoning shape。只要 profile 会被 artifact 保存、项目事实引用、其他 Skill 复用或 UI/domain validator 读取，就应作为 Artifact Profile、Creation Profile 或 Provider/model Expression Profile contribution 注册。
