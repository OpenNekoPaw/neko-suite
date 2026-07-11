import type { Skill } from '@neko/shared';
import { localizeBuiltinSkill } from './builtin-skill-content';

const skillCreatorContent = `# Skill Creator

Guide the creation or refinement of reusable, portable Agent Skills. A Skill is a focused package of instructions and optional resources that helps an Agent perform a recurring class of work consistently.

This guidance does not own filesystem access, permissions, activation, or trust. Any host-supported authoring path may create the same portable package. Choose the available path that best fits the task and the user's instructions.

## Decide Before Writing

1. Confirm that reusable guidance is more appropriate than a one-off answer or a product feature.
2. Identify the recurring trigger, expected outcome, important constraints, and evidence of success.
3. Choose the smallest useful package: instructions only, or instructions plus reusable scripts, references, assets, or host metadata.
4. Keep the portable method in the Skill and keep host runtime protocols, internal schemas, and product-specific wiring outside it.

Use a short lowercase hyphenated name. Write a description that states both what the Skill does and when it should be used.

## Portable Package

A portable Skill package has this shape:

~~~text
skill-name/
├── SKILL.md
├── scripts/              # optional
├── references/           # optional
├── assets/               # optional
└── agents/
    └── <host>.yaml       # optional host metadata
~~~

- \`SKILL.md\` is required. Its frontmatter defines \`name\` and \`description\`; its body contains the guidance loaded when the Skill is used.
- \`scripts/\` contains deterministic or frequently repeated operations.
- \`references/\` contains detailed material that should be loaded only when needed.
- \`assets/\` contains templates or files used in produced output rather than prompt context.
- \`agents/<host>.yaml\` is an optional host overlay. Preserve overlays for other hosts when updating a shared Skill.
- A root \`manifest.json\` is not part of the portable Skill contract. Do not require one for creation or reuse.

## Authoring Principles

- Be concise. Assume the Agent already knows general concepts and include only task-specific judgment, procedure, or constraints.
- Match specificity to risk: use flexible guidance for contextual work and scripts or exact steps for fragile deterministic work.
- Put the main workflow in \`SKILL.md\`; move large examples, schemas, and background material into \`references/\`.
- Make references discoverable from \`SKILL.md\` and avoid deep chains of references.
- Reuse existing files when updating a Skill. Do not replace user-authored resources or other-host overlays without a task-specific reason.
- Keep secrets, machine-specific absolute paths, runtime tool schemas, and host-internal protocols out of portable content.

Draft, review, and apply may be useful authoring techniques, but they are not mandatory Skill-creation gates. User approval is required only when the active host policy or the user's instructions require it; the Skill itself must not invent an approval barrier.

## Validation

Before reporting completion:

1. Check the package shape, frontmatter, names, links, and referenced files.
2. Run bundled scripts or focused tests when present.
3. Inspect the Skill for duplicated generic knowledge, hidden host coupling, obsolete manifest requirements, and unsupported claims.
4. Forward-test with realistic prompts that should trigger the Skill and nearby prompts that should not.
5. Report what was created or changed, what was validated, and any remaining uncertainty. Do not claim files were written unless the selected authoring path confirmed the write.
`;

const skillCreatorZhCnContent = `# Skill Creator

指导创建或改进可复用、可移植的 Agent Skill。Skill 是由聚焦的指导和可选资源组成的包，用于帮助 Agent 稳定完成一类重复工作。

本指导不拥有文件系统访问、权限、激活或信任。宿主支持的任何创作路径都可以创建同一种可移植包；应根据任务和用户指令选择合适的现有路径。

## 写入前判断

1. 确认可复用指导比一次性回答或产品功能更合适。
2. 明确重复触发场景、预期结果、关键约束和成功证据。
3. 选择最小可用包：仅指导，或指导加可复用脚本、参考资料、资产或宿主元数据。
4. 把可移植方法保留在 Skill 中，把宿主运行时协议、内部 schema 和产品接线留在 Skill 之外。

名称应简短、使用小写连字符。描述应同时说明 Skill 做什么，以及应在什么场景使用。

## 可移植包

可移植 Skill 包采用以下结构：

~~~text
skill-name/
├── SKILL.md
├── scripts/              # optional
├── references/           # optional
├── assets/               # optional
└── agents/
    └── <host>.yaml       # optional host metadata
~~~

- \`SKILL.md\` 是必需文件。frontmatter 定义 \`name\` 和 \`description\`；正文包含 Skill 使用时加载的指导。
- \`scripts/\` 存放确定性操作或频繁重复的操作。
- \`references/\` 存放只应按需加载的详细资料。
- \`assets/\` 存放输出时使用的模板或文件，而不是提示词上下文。
- \`agents/<host>.yaml\` 是可选宿主 overlay。更新共享 Skill 时，应保留其他宿主的 overlay。
- 根级 \`manifest.json\` 不属于可移植 Skill 契约。创建或复用 Skill 时不得强制要求它。

## 创作原则

- 保持简洁。假设 Agent 已理解通用概念，只补充任务专属的判断、流程或约束。
- 让具体程度匹配风险：上下文相关工作使用灵活指导，脆弱的确定性工作使用脚本或精确步骤。
- 主流程放在 \`SKILL.md\`；大型示例、schema 和背景资料移入 \`references/\`。
- 从 \`SKILL.md\` 明确引用参考资料，避免多层引用链。
- 更新 Skill 时复用现有文件。没有任务专属理由，不要替换用户创作的资源或其他宿主 overlay。
- 不要把秘密、机器专属绝对路径、运行时工具 schema 或宿主内部协议写入可移植内容。

Draft、review 和 apply 可以作为创作方法，但不是 Skill 创建的强制 gate。只有当前宿主策略或用户指令要求时才需要用户批准；Skill 自身不得发明批准门槛。

## 验证

完成前：

1. 检查包结构、frontmatter、名称、链接和被引用文件。
2. 存在捆绑脚本或聚焦测试时，运行它们。
3. 检查 Skill 是否重复通用知识、隐藏宿主耦合、保留过时 manifest 要求或包含无依据声明。
4. 使用应触发 Skill 的真实提示词和不应触发的邻近提示词进行 forward test。
5. 报告创建或修改了什么、验证了什么以及剩余不确定性。除非所选创作路径确认写入成功，否则不要声称文件已写入。
`;

const localizedSkillCreatorContent = {
  default: skillCreatorContent,
  localized: { 'zh-cn': skillCreatorZhCnContent },
};

export const skillCreatorSkill: Skill = {
  name: 'skill-creator',
  description:
    'Guide for creating or updating reusable portable Agent Skills. Use when the user wants to design, create, refine, validate, or forward-test a Skill package without imposing a host-specific authoring gate.',
  content: skillCreatorContent,
  icon: '🧩',
  source: 'builtin',
  enabled: true,
};

export function getSkillCreatorSkill(locale?: string): Skill {
  return localizeBuiltinSkill(skillCreatorSkill, localizedSkillCreatorContent, locale);
}
