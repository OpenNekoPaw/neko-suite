# Skill 写作指南

> 状态：当前规范（2026-04-26）  
> 关联：[Skill as Prompt-Chains ADR](../architecture/adr-skill-as-prompt-chains.md) · [Agent Unified Workflow](../architecture/agent-unified-workflow.md)

## 核心原则

Skill 是给 Agent 阅读的场景包，不是工作流 DSL。工作流程应写在正文里，让 Agent 在 IDC（Draft / Plan / Apply）框架内按任务复杂度自主合并、跳过或回退。

确定性边界仍放在 metadata 中：工具白名单、子包依赖、合规要求、信任等级等需要程序消费的字段不能只写在正文里。

## 文件结构

```text
my-skill/
  SKILL.md
  references/        # 可选：Agent 按需读取
  scripts/           # 可选：工具或辅助脚本
  assets/            # 可选：示例或小型资源
```

## 推荐 Frontmatter

```yaml
---
name: cut-tiktok-creator
description: TikTok 短视频创作师。Use when creating short-form vertical videos.
allowedTools:
  - Read
  - Grep
  - cut.trim_clip
  - cut.export_mp4
requiredSubpackages:
  - id: neko-cut
    required: true
  - id: neko-audio
    required: false
compliance:
  approvalRules:
    - tool: cut.export_mp4
      mode: ask
---
```

不要在 frontmatter 或 manifest 中使用 `phases`、`pipelines`、`workflow`、`stages` 等编排 DSL 字段。 这些字段不属于当前 Skill 契约，运行时不会消费它们；流程应写在正文 prompt-chain 章节中。

## 推荐正文结构

```markdown
# TikTok 短视频创作师

你是资深短视频剪辑师，熟悉快节奏剪辑、钩子镜头和平台审美。

## 使用场景

当用户需要制作 TikTok / 抖音 / 小红书竖屏短视频时使用。

## 工作流程

1. 先理解目标受众、平台、时长和参考风格。
2. 复杂任务先写 Draft 描述创意方向；简单修改可直接进入 Apply。
3. 需要多镜头时写 Plan，列出镜头、素材、字幕、音乐和导出步骤。
4. 执行剪辑时逐步修改 timeline，并在关键输出后检查结果。
5. 导出前确认格式、分辨率、封面、字幕和音频节奏。

## 判断点

- 如果用户只要求小改动，可以跳过 Draft。
- 如果缺少素材，先询问或使用占位方案。
- 如果导出或删除等不可逆操作会发生，先请求用户确认。

## 失败恢复

- 生成失败：降低分辨率或切换备用模型。
- 素材缺失：报告缺失项并给出替代路径。
- 时间线不一致：回看 Plan 和当前 timeline，再逐项修复。

## 交付标准

- 输出路径明确。
- 关键参数可追溯。
- 用户能理解还剩哪些未完成事项。

## 跨 Skill 协作

音频细节复杂时，可建议切换到音频相关 Skill；角色一致性问题可建议使用角色索引相关 Skill。
```

## 反模式

| 反模式                                   | 正确做法                                      |
| ---------------------------------------- | --------------------------------------------- |
| 用 `phases` / `pipelines` 声明流程       | 在正文 `## 工作流程` 写自然语言 prompt-chain  |
| 在正文里写工具白名单                     | 放入 `allowedTools` 或合规 metadata           |
| 用 XML / YAML / Mermaid 在正文中伪装 DSL | 写成自然语言判断点和恢复策略                  |
| 强制所有任务都走 Draft → Plan → Apply    | 说明何时可跳过、合并或回退                    |
| 把审批点只写成建议                       | 不可逆工具审批放入 `compliance.approvalRules` |

## 验收清单

- Frontmatter 没有 workflow DSL 字段。
- 描述包含 What + When，便于 Skill 匹配。
- 正文包含使用场景、工作流程、判断点、失败恢复和交付标准。
- 安全、权限、依赖和合规边界是结构化 metadata。
- Agent 即使不读取任何外部资源，也能理解 Skill 的核心行为。
