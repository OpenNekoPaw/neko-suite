## Why

Evaluation 平台能够发现 Prompt 或 Skill 质量回退，但“分析报告、生成候选、人工批准、验证并接受或拒绝”的 Debug Functional 流程仍需要独立契约。若把优化器并入 runner，或允许它直接改 canonical Skill，会把质量判断、代码归因和仓库变更混成不可审计的自动写入路径。

## What Changes

- 以 `establish-agent-evaluation-platform` 产出的结构化质量报告、证据、baseline 和失败归因为唯一输入，不复制 runner、Judge、artifact validator 或报告实现。
- 只有 `skill-content`、公开 Skill description、Prompt-owned method guidance 或经证据确认的 Prompt routing 问题可以进入优化；Capability/Tool、Runtime/Session、Provider、Artifact 或 Evaluation infrastructure 缺陷必须转入其 owning OpenSpec 或记录 blocker。
- 生成只读 `optimization-plan.md` 和 candidate patch artifact，记录 evidence refs、目标层/文件、预期改善、风险、预算和 required regression matrix；默认不修改 canonical worktree。
- 建立本地 Skill development checkpoints/history：复用 Host-owned Skill identity，以 package fingerprint 标识 base/candidate 内容，通过显式 lineage 关联 Evaluation 报告、候选、人工决定和 accepted/rejected/superseded 状态。
- 要求人工批准后才通过正常 OpenSpec/apply 路径应用候选；禁止优化器直接修改 canonical Skill 或自行提交开发变更。
- 使用隔离 revision/worktree/build 运行 baseline 与 candidate，通过 Evaluation 平台执行 hard gates、重复采样、blind A/B、optimizer-hidden holdout 和既有 regression。
- 建立 bounded iteration：候选数、迭代数、token/cost、时间和 no-improvement 上限；任何 hard-gate、holdout 或受保护 regression 回退都拒绝接受候选。

## Capabilities

### New Capabilities

- `skill-prompt-optimization-loop`: 定义从 Evaluation 失败归因到候选计划、人工批准、隔离执行、blind/holdout/regression 验证和候选接受/拒绝的完整状态机。
- `skill-development-history`: 定义本地 Skill identity、fingerprint checkpoint、parent lineage、Evaluation evidence 和开发候选状态；不承担 Market package version 或发布历史。

### Modified Capabilities

无。

## Impact

- 依赖 `establish-agent-evaluation-platform` 的 v2 report、baseline、comparison 和 suite selection contracts；在平台 capability 可用前不得建立临时 runner 或降级为 final-text comparison。
- 主要影响 `scripts/agent-eval/` 的 optimization-plan schema、candidate metadata、approval record 和 orchestration glue，以及 `.codex/skills/neko-agent-evaluation` 的报告解释与优化方法论。
- 可能使用隔离 Git worktree/build 执行候选，但不把 candidate checkpoint label、revision 或 repository diff 暴露给 blind Judge，也不向 TUI runtime 注入 eval-specific candidate 状态。
- 不改变 Agent 产品 Skill runtime protocol，不新增 Dashboard action、Agent capability 或 `neko eval`。
- Skill package id、semver、发布、安装和分发历史由 Market 管理；本 change 只记录本地开发 fingerprint lineage。
