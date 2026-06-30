# ADR: Agent Skill Creator 与技能创作校验边界

状态：Proposed
日期：2026-06-30
范围：`neko-agent` Skill authoring、Skill catalog、Skill manifest、内置/项目/个人/市场 Skill、Agent lifecycle capability、Canvas/Cut/Model 等领域能力引用、质量门禁。

本文记录 Neko Suite 对 “由 Agent 辅助创作标准化 Skill，并用确定性校验保证 Skill 可安全激活和可维护” 的系统级边界。它补充 [`adr-agent-skill-catalog-activation-boundary.md`](adr-agent-skill-catalog-activation-boundary.md)、[`adr-agent-command-skill-trigger-boundary.md`](adr-agent-command-skill-trigger-boundary.md)、[`adr-agent-sandbox-and-external-processing-boundary.md`](adr-agent-sandbox-and-external-processing-boundary.md)、[`adr-unified-markdown-resource-rendering.md`](adr-unified-markdown-resource-rendering.md) 和 [`package-boundaries.md`](package-boundaries.md)。

## 背景

Skill 已经不是普通提示词片段。它会影响 Agent 的领域策略、工具选择、媒体工作流、Canvas/Cut/Model capability 调用、资源引用规则和用户对后续动作的预期。近期分镜表和 Markdown Canvas handoff 的问题暴露了同一类风险：

- 旧协议提示词残留会让 Agent 继续输出 `CompositeArtifact`、`StoryboardTable`、`neko-composite` 或旧 plugin-transfer 概念。
- Skill metadata、正文、内置测试和中英文版本可能漂移，导致 Agent 触发正确但输出格式错误。
- 资源引用策略如果只写在 prompt 中，Agent 容易把聊天顺序、裸文件名、Webview URI、blob URL 或系统临时路径当成稳定素材身份。
- Canvas creative table、review/plan/execute 字段、lifecycle capability 和 validation requirements 需要跨 Skill 一致表达，不能靠每个 Skill 作者手写记忆。

Codex 的 `skill-creator` 模式可作为作者体验参考：Skill 应保持简洁、渐进披露、脚本化校验和真实任务 forward test。但 Neko 不能照搬为一个任意生成 prompt 的万能工具。Neko Skill 会进入本地 VS Code 创作产品的运行时边界，必须用确定性 validator 和 approval gate 守住权限、资源和能力调用。

## 决策

Neko 支持一个 Neko-specific Skill Creator 能力，但其职责是 **创作辅助**，不是激活权威、权限授予器或领域 compiler。Skill 是否可注册、可激活、可作为内置/项目/个人/市场能力暴露，由确定性的 Skill Authoring Validator 决定。

```text
User / Agent asks to create or update a Skill
        |
        v
Skill Creator drafts files and examples
  SKILL.md, manifest.json, optional references/scripts/assets/tests
        |
        v
Skill Authoring Validator
  structure, manifest, prompt quality, locale parity,
  capability refs, resource policy, domain/profile rules
        |
        v
Review artifact + diagnostics + suggested fixes
        |
        v
User approved apply
        |
        v
Skill registry/catalog sees a valid Skill
        |
        v
Agent may later call ActivateSkill through canonical path
```

不是：

```text
Agent generates a Skill
  -> Skill auto-enables tools/capabilities
  -> Skill is silently activated
  -> Invalid prompt falls back to old protocol or default success
```

## 架构自检

1. 是否符合现有架构？

   符合。现有架构已经把 Skill 激活权威放在 Agent `ActivateSkill` + runtime guard，而不是 Webview keyword router。Skill Creator 只产生文件草稿，Validator 只产生诊断，不绕过 SkillRegistry、SkillService、SkillInjectionCoordinator、subpackage guard、tool guard、workspace trust 或 lifecycle capability approval。

2. 如何进一步降低耦合？

   Validator 采用注册式规则集。通用结构和 manifest shape 留在 `@neko/shared`；Neko Agent prompt 质量、内置 Skill locale parity 和 built-in metadata 检查留在 `neko-agent`；Canvas creative table、Cut plan、Model rig 等领域规则通过 profile/capability validator 注册，不让 core Skill loader import 领域包 internals。

3. 是否易于扩展与测试？

   易于扩展。新增领域 Skill 只需要声明 profile validator 和模板；新增作者体验只调用同一 validator。测试可以从 brittle string assertions 收敛为规则级 fixtures、golden prompt 快照和 forward-test 样例。

## 五层分析

| 层 | 职责 | 依赖 | 接口 | 扩展 | 测试 |
| --- | --- | --- | --- | --- | --- |
| L0 共享契约 | Skill manifest shape、基础诊断、通用校验结果 | 零或共享基础依赖 | `SkillManifest`、`SkillValidationResult`、authoring diagnostic DTO | 新 manifest 字段、诊断 code | schema/shape unit tests |
| L1 Agent Skill runtime | 读取 Skill、注册 catalog、激活和注入 | `@neko/shared` | `SkillLoader`、`SkillRegistry`、`SkillService` | 新 source、lazy loading、lifecycle slot | loader/registry/service tests |
| L2 Authoring Validator | 校验 Skill 文件、prompt、metadata、locale、能力引用 | Agent runtime + shared rules | `validateSkillAuthoring(input)` | 规则注册表、domain/profile validator | fixture tests、forbidden-term tests |
| L3 Skill Creator | 生成/修改 Skill 草稿和修复建议 | Validator + file runtime | create/update/review/apply capability | 模板、资源目录、sample tests | generated fixture validation |
| L4 Domain profiles | Creative table、Canvas Markdown、Cut plan 等领域约束 | capability descriptors，不导入领域 internals | profile validator id + rule module | 新 profile、新字段组合 | domain fixture tests |

## Skill 标准产物

标准 Skill 目录由以下文件组成：

| 文件/目录 | 角色 | 要求 |
| --- | --- | --- |
| `SKILL.md` | Agent 读取的 prompt 指南 | 必须存在；frontmatter 至少包含 `name` 和 `description`；正文保持简洁，只放 Agent 执行任务需要的步骤和边界 |
| `manifest.json` | Runtime/catalog 读取的结构化契约 | 推荐所有新 Skill 使用；声明 `domain`、`requiredSubpackages`、`mediaWorkflow`、`referencedSkills`、`catalog`、`compliance` 等机器字段 |
| `references/` | 渐进披露资料 | 只放任务需要时才读取的长文档、schema、领域规则 |
| `scripts/` | 确定性辅助脚本 | 只在重复、脆弱或需要 deterministic reliability 时加入；脚本必须可单独测试 |
| `assets/` | 输出或模板资源 | 不应为了解释 Skill 而存放额外文档 |
| `tests/` 或 fixtures | 作者验证输入 | 可选；复杂 Skill 应包含真实任务样例、期望诊断或 golden output 片段 |

`SKILL.md` frontmatter 是 Agent 可见的 prompt metadata。Runtime-only 配置优先进入 `manifest.json`，避免把结构化配置塞进 prompt window。现有 legacy 或过渡格式可由 loader 读取，但新作者入口和 validator 应以 `SKILL.md` + `manifest.json` 为 canonical authoring shape。

## Skill Creator 职责

Skill Creator 是一个 authoring workflow，可由 CLI、Agent tool、Webview 管理 UI 或未来 marketplace authoring UI 调用。它应支持：

- 从用户目标、示例请求和期望产物生成 Skill 草稿。
- 选择模板：generic task、creative table、Canvas handoff、Cut plan、quality review、external processor orchestration 等。
- 创建最小目录结构，只生成必要的 `references/`、`scripts/`、`assets/`。
- 生成 `SKILL.md`、`manifest.json`、locale draft 和验证 fixtures。
- 根据 validator diagnostics 提出修复 patch。
- 生成 review artifact，让用户批准后才写入项目/个人 Skill 目录。

Skill Creator 不负责：

- 自动启用 Skill。
- 自动扩大 allowed tools、subpackage、workspace trust 或 external processor 权限。
- 把 prompt 生成的 JSON 当作 Canvas/Cut/Model 节点事实。
- 绕过 `ActivateSkill`、lifecycle capability approval 或领域 capability validator。
- 为每个领域创建新的 compiler。领域执行仍通过 typed capability/MCP-like tool 完成。

## Validator 分层

Skill Authoring Validator 是 canonical gate。它返回 typed diagnostics，不修改文件，不自动激活 Skill。

| 等级 | 名称 | 说明 | 失败级别 |
| --- | --- | --- | --- |
| V0 | Structure | `SKILL.md` 存在、frontmatter 可解析、folder/name 合法、无多余必删模板文件 | error |
| V1 | Manifest | `manifest.json` shape、`mediaWorkflow` 数组字段、禁止 workflow DSL 字段、subpackage/cost/risk/compliance shape | error/warning |
| V2 | Prompt Boundary | 禁止旧协议、禁止 runtime-only 路径、禁止直接 Canvas node JSON、要求 fail-visible 边界文案 | error/warning |
| V3 | Capability Reference | `referencedCapabilities`、`suggestedProjectors`、`validationRequirements` 与已注册 capability/profile 对齐 | error/warning |
| V4 | Domain/Profile | CreativeTable、Canvas Markdown、Cut plan、Model rig 等领域 profile 必填字段、资源策略和动作字段 | error/warning |
| V5 | Locale Parity | 中英文或多 locale Skill metadata、关键章节、能力引用、禁用词和资源规则一致 | warning/error for builtins |
| V6 | Forward Fixtures | 示例请求、golden prompt、validator snapshot 或 smoke invocation 可运行 | warning by default |

内置 Skill 的 V2/V4/V5 应默认作为 CI error；用户项目/个人 Skill 可先以 warning 呈现，除非会扩大工具权限、写项目事实、调用高风险 capability 或引用未知 provider。

## 规则注册

Validator 不把所有领域词汇硬编码在一个文件中。规则应按来源注册：

| 规则来源 | 例子 | Owner |
| --- | --- | --- |
| shared structural rules | name、description、manifest shape、forbidden manifest DSL | `@neko/shared` |
| agent authoring rules | prompt size、frontmatter/body 分离、allowed tool 文案、locale parity | `neko-agent` |
| lifecycle rules | capability id、phase、approval、validation requirements | Agent capability lifecycle runtime |
| Canvas profile rules | `CreativeTable`、`GenericTable`、`canvas.ingestMarkdown`、resource binding policy | Canvas capability descriptor / shared profile metadata |
| Cut/Model/Sketch rules | timeline plan、model rig、sketch operation 等 | owning domain descriptor |
| project policy rules | workspace trust、禁用 processor、组织/项目约束 | Host/project policy adapter |

规则注册只暴露 descriptor 和 validator function，不让 Agent Skill loader import domain implementation internals。未知规则 id 必须 fail-visible，不能静默通过。

## Creative Skill 最小规范

面向 Canvas creative table 的 Skill 必须明确三层创作信息：

| 层 | 目的 | 常见字段 |
| --- | --- | --- |
| 审阅层 | 用户看懂素材、镜头、决策和证据 | `scene`、`shot`、`source`、`sourcePanel`、`decision`、`visual`、`audio`、`characters`、`dialogue`、`reviewStatus` |
| 计划层 | 建议后续操作、生成提示词和待补信息 | `duration`、`motion`、`prompt`、`decisionReason`、`requiresSplit`、`nextAction` |
| 执行层 | 记录可执行动作、结果引用和状态 | action id、target、result refs、execution status、diagnostic |

Skill 可以扩展字段，但必须让未知列仍作为 review metadata 保留。`generic table` 是 display-only 的兜底；不能把 generic fallback 呈现为 creative success。

资源引用规范：

- Markdown 展示优先使用 CommonMark image：`![label](token)` 或 `![label](relative-or-managed-ref)`。
- token 只用于对接 local adapter 提供的稳定 `ResourceRef` / `DocumentResourceRef`；Agent 不得把 `P1`、聊天顺序或裸文件名当作资源身份。
- 没有稳定绑定时写 `needs-resource-binding` 或 diagnostic，不猜测 `read-image-*.jpg`。
- 禁止在 Skill 输出或协议中写入 Webview URI、blob URL、system temp path、cache path 或 `asWebviewUri(...)` 结果。

## Lifecycle 能力建议

Skill Creator 自身可以作为 lifecycle-backed authoring capability 暴露，阶段语义如下：

| Capability | Phase | 副作用 | 说明 |
| --- | --- | --- | --- |
| `agent.skill.describeAuthoringTemplates` | describe | 否 | 返回可用模板、profile 和规则摘要 |
| `agent.skill.validateSkill` | validate | 否 | 对 Skill 目录或草稿内容返回 diagnostics |
| `agent.skill.createSkillDraft` | review | 可创建草稿 artifact | 生成 Skill 草稿和修复建议，不写 canonical Skill 目录 |
| `agent.skill.applySkillDraft` | apply | 是，需要 approval | 写入 project/personal Skill 目录，随后触发 registry rescan |

这些 id 是建议命名；实现可调整，但必须保持同一语义：`validate` 不写文件，`review` 只创建可审阅草稿，`apply` 才写 canonical Skill。市场发布、插件打包和内置 Skill 变更不属于普通 `applySkillDraft` 的默认目标，必须走各自 owner 的发布流程。

## 与现有文档和代码的关系

- [`packages/neko-agent/docs/skill-authoring.md`](../../packages/neko-agent/docs/skill-authoring.md) 应作为作者操作指南；本文是系统边界。
- `@neko/shared` 已有 `SkillManifest`、`SkillMediaWorkflowHint` 和基础 `validateSkillManifest`，但它只覆盖 shape，不覆盖 prompt quality、locale parity 或领域 profile。
- `neko-agent` 的 built-in skill tests 已经包含不少 prompt 断言，后续应收敛为规则化 validator，减少散落的 `contains` / `not contains` 断言。
- Canvas Markdown / creative table 的字段和资源规则应通过 profile validator 暴露给 Skill Authoring Validator，而不是复制到每个 Skill 的测试中。

## 非目标

- 不把 Skill 变成 workflow engine；流程顺序仍在 prompt-chain 和 Agent reasoning 中表达。
- 不引入远程多租户 Skill 审批服务。
- 不让用户项目 Skill 自动获得 core trust。
- 不把 validator 变成新的 Markdown/storyboard compiler。
- 不要求所有普通文字型 Skill 都包含 fixtures；复杂或高风险 Skill 才需要。
- 不因为 validator warning 而阻止用户阅读或编辑本地 Skill；阻止的是注册、激活、扩大权限或创建项目事实。

## 风险与约束

| 风险 | 约束 |
| --- | --- |
| Validator 过度硬编码，阻碍 Skill 扩展 | 使用规则注册和 profile descriptor；核心只知道通用 authoring contract |
| AI 生成的 Skill 看起来合理但不可执行 | Creator 输出必须通过 validator；复杂 Skill 增加 forward fixtures |
| prompt 质量检查变成脆弱字符串测试 | 禁用词可字符串匹配，正向要求优先用结构化 manifest、章节 presence、capability refs 和 fixture 输出验证 |
| 用户 Skill 被过度拦截 | 区分 warning 与 error；只在安全、权限、未知 capability、runtime-only 资源和项目事实写入边界 fail-closed |
| 中英文版本漂移 | 内置 Skill 的 locale parity 作为 CI error；项目 Skill 可 warning |

## 代码缺口

当前实现与本 ADR 之间的主要 gap：

1. 缺少独立的 `SkillAuthoringValidator` 服务或模块。现有 `validateSkillManifest` 只做结构校验。
2. 内置 Skill prompt 质量检查散落在 `builtin-skills.test.ts`，缺少可复用规则集。
3. 缺少统一的废弃协议/旧路径 scanner，例如 `CompositeArtifact`、`StoryboardTable`、`neko-composite`、plugin-transfer、`@neko/draft-runtime`。
4. 缺少 locale parity validator，用于检查中英文 Skill 的关键能力引用、资源策略和字段要求一致。
5. 缺少 capability/profile reference validator，无法自动发现 Skill 引用未知 `canvas.*`、Cut、Model 或 processor capability。
6. 缺少 CreativeTable / GenericTable / Canvas Markdown profile validator，导致分镜表字段、资源引用和三层创作信息仍依赖每个 prompt 手写。
7. 缺少 Skill Creator scaffold/apply capability；目前只能人工编辑 Skill 文件。
8. `packages/neko-agent/docs/skill-authoring.md` 需要在实现时同步更新 canonical `SKILL.md` + `manifest.json` 写法和 validator 流程。

## 验证要求

实现本 ADR 的变更至少需要覆盖：

- 新 Skill scaffold 生成后能通过 V0/V1。
- 带旧协议词的 Skill 在内置 Skill CI 中失败。
- 带 Webview URI、blob、系统临时路径或裸 `read-image-*.jpg` 资源身份的 creative Skill 失败或产生明确 diagnostic。
- `mediaWorkflow.referencedCapabilities` 引用未知 capability 时 fail-visible。
- Creative table Skill 缺少 `reviewStatus`、`nextAction`、资源绑定策略或 Canvas lifecycle handoff 说明时产生 diagnostic。
- 中英文内置 Skill 关键章节、字段列表、capability refs 和禁用词检查保持一致。
- `validate` phase 不写文件；`review` phase 只写草稿 artifact；`apply` phase 必须有用户 approval。
- Skill 激活仍只走 `$skill`、`invokeSkill` 或 Agent `ActivateSkill`，Creator 不能自动激活。

## 后续

推荐实施顺序：

1. 提取 `SkillAuthoringValidator` 和通用 diagnostics DTO。
2. 将内置 Skill prompt 断言迁移为 validator fixtures。
3. 增加 CreativeTable / Canvas Markdown profile validator。
4. 增加 locale parity validator。
5. 增加 `agent.skill.validateSkill` capability 或 CLI/测试入口。
6. 最后增加 Skill Creator scaffold/review/apply workflow。
