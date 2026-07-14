## Context

现有 `packages/neko-agent/packages/agent/src/experiment/` 定义 `AblationToggles`、presets、`ExperimentRunner`、metrics、comparison 和 reports；CLI `neko experiment` 另行装配 `AgentSession` 并执行。该路径与真实 TUI debug automation 平行，runtime 还通过 `__ablation` marker/no-op branches 识别实验状态。

此前架构允许 `experiment` 作为独立 validation utility 保留。本 change 显式替换该决定：消融是 `establish-agent-evaluation-platform` 的一种 suite mode，而不是 Agent 产品或独立 session owner。

## Goals / Non-Goals

**Goals:**

- 让配置和实现消融复用真实 TUI、证据、质量、报告和比较能力。
- 从 Agent runtime 删除 experiment-specific orchestration、marker 和双路径。
- 保留真实产品配置和中立运行指标的 canonical ownership。

**Non-Goals:**

- 不把所有内部实现变成永久 feature flag。
- 不保留 `neko experiment` alias、direct-session fallback 或第二套 report schema。
- 不把旧 experiment 结果升级为真实 Agent acceptance baseline。

## Decisions

### 1. Ablation 是 Evaluation suite mode

`scripts/agent-eval` 拥有 ablation matrix、baseline/variants、repetitions、fixtures、isolation、Judge、aggregation、comparison 和 reports。每个 run 仍通过 TUI debug automation，获取与普通 Evaluation 相同的 facts 和 hard gates。Ablation report 在通用 report 上增加 variant delta，不另建 runner 或结果事实来源。

### 2. 配置消融只使用真实 runtime profile

Configuration ablation 比较 Agent 已支持的 session-scoped immutable settings，例如 model/profile、thinking budget、execution mode、memory/context policy、Skill/capability enabled state。平台记录 requested/effective config 和 digest；未生效或发生默认回退时配置失败。

仅为实验存在的 toggle 不进入 Agent config。当前 `AblationToggles` 中确属真实产品变化点的字段迁入 canonical config/profile contract；其余字段通过 implementation ablation 处理。

### 3. 实现消融使用隔离 revision/build

若实验目标是移除 Prompt fragment、Skill injection、routing implementation 或内部 hook，而该能力不是合法产品配置，则创建 baseline 与 variant 的隔离 revision/worktree/build。两个目标通过相同 TUI driver、fixture、provider/model 和 budget 执行。拒绝 `__ablation` marker、no-op hook 或隐藏 runtime branch，因为它们会让生产代码长期维护实验双路径。

Skill-targeted variants 必须记录同一个 Host Skill identity 下的 base/variant package fingerprints，或提供显式 rename/move lineage。Ablation 结果作为 Evaluation evidence 关联 development history checkpoint；不得创建 Skill semver 或 Market publication state。

### 4. Runtime 只测量原始事实

Agent/TUI 保留 token usage、turn/task latency、iterations、tool calls、retry、task/artifact outcome 和 effective config facts。Evaluation 负责 pass rate、mean/distribution、p50/p95、cost、quality delta 和 statistical presentation。领域 runtime 的 `QualityEvidence` 保持产品事实，不被通用 Judge 取代。

比较报告必须区分三个不可互相替代的证据面：

1. **Correctness hard gates**：证明 canonical path、配置、Skill/Tool 激活、permission、格式/schema、产物身份和 no-fallback。它们决定样本是否有资格进入质量阶段，但不产生内容质量分数。
2. **Execution efficiency**：记录 latency、token、cost、iteration、Tool/retry/task 指标。它们描述资源和速度，不表示回答更相关、更完整或更有创作质量。
3. **Output content quality**：只读取真实模型最终输出和 allowlisted artifact/领域质量证据，由 suite-owned rubric 的 blind Judge 评估相关性、约束满足、推理完整性、具体性、一致性和适用的创作/审美质量。只有实际 Judge 样本才能产生 `qualityMean`。

`hard-gates-only` 表示内容质量未评估，而不是质量通过。Ablation plan 若声明 `scenario-rubric`，其 `rubricRef` 必须与所选 scenario 完全一致；若 scenario 未启用对应 rubric，authoring validation 在启动 TUI 前失败。反之，`hard-gates-only` plan 不得选择带 rubric 的 scenario，也不得把 pass rate、字段命中或任何效率指标投影成 quality available。

### 5. 旧 experiment 路径一次性移除

迁移顺序先在平台建立 configuration 和 implementation ablation plan，并真实尝试两个 pilot；随后断开 CLI command/export/callers，删除 `ExperimentRunner`、presets、comparison/report、`applyAblationToggles`、marker consumers 和专属 tests。两个 pilot 的基础设施失败必须保留为剩余风险，但根据 2026-07-13 的明确清理决定，不再阻止旧生产路径删除。旧命令必须 absent/unknown，不保留 alias 或 delegate。

这属于预发布内部 breaking cleanup。旧 `.neko/experiments` 报告是可重建开发产物，可忽略或手动保留，不迁移为 baseline；不删除用户项目、设置或有价值创作产物。

### 6. Preset 迁移按实验意图重建

`NO_SKILL_INJECTION` 等名称不能机械复制。每个 preset 先分类为真实配置、实现 revision、已过时或不适用，再在 suite 中声明 expected path、forbidden fallback、性能指标和质量 rubric。组合矩阵默认采用 baseline + 单维 variants，只为有证据的交互增加组合，避免笛卡尔积。

消融 case 的 invariant hard gates 不得重复被移除的 Prompt/Skill 指导本身。例如移除 rationale guidance 时，Skill identity、TUI path、最低可审阅 Draft 和 no-execution 仍是 hard gates；rationale 的深度、创作取舍和具体性属于内容 rubric。用户 prompt 也不得重新显式注入被消融的指导，否则 variant 无法归因。

### 7. Canonical TUI 启动使用显式 package/build contract

真实 pilot 暴露的 package loader 缺口在 owning production boundary 修复，而不是在 Evaluation runner 中添加 loader flag：

- VS Code extension package 若保持 CJS main，其 TUI/CLI host-neutral subpath 使用显式 ESM wrapper，不能依赖 `tsx -e` 的 CommonJS named-export 互操作。
- CLI bundler 必须 bundle 所有导出 raw TypeScript 的 workspace dependencies；Node 与 Bun 专属模块通过 ESM code splitting 保持动态运行时边界，不能在 Node CLI 启动时静态解析 `bun:` module。
- Node 24 bundle 必须保留 `node:` protocol，尤其不能把 `node:sqlite` 改写为不存在的 bare `sqlite` package。source 与 bundle entrypoint 必须使用会实际调用 CLI main guard 的 canonical 文件名；加载后以 0 退出但未执行 Commander/debug automation 不算启动成功。
- TUI 初始化失败必须从 App/session owner 立即投影 owning diagnostic，不能退化成 readiness timeout。partial runtime profile 只能覆盖已声明字段，不能用 `undefined` 清除已加载默认值。
- 隔离 fixture 可位于用户 home 之外；workspace registry 仍禁止绝对持久 locator，但 Node binding 必须在 `${HOME}` contraction 不适用时使用 shared relative locator contract。
- 固定旧 revision 的 implementation ablation 使用 base/variant 完全相同且 fingerprint 化的 external build recipe。recipe 可选择该 revision 已存在的完整 bundle 产物，但不得修改 runtime、注入 marker 或让两个 variant 使用不同基础设施；它还必须通过真实 `session.create` probe，而不只是检查文件存在或 `--help` 进程退出码。
- 用作 implementation comparison 的 development checkpoint 必须已经提供当前 suite 要求的 effective-config、collection completeness、Skill/path 和 no-fallback facts。缺少当前 evidence contract 的历史 revision 即使真实模型有输出也属于 configuration-invalid，不能用旧 facts、弱文本匹配或 working-tree 快照补成可比较样本。

回归验证同时覆盖实际 source CLI ESM import、built CLI `--help`、partial runtime profile、初始化失败 diagnostic 和完整 TUI debug automation。只通过 Vitest/Vite 的 bundler import 或 bundle 加载退出码不足以证明 Node ESM product path。

## Risks / Trade-offs

- [Risk] 删除 CLI utility 降低临时实验便利性。 -> 在 `scripts/agent-eval` 提供单一 ablation suite入口和清晰 README，不在产品 CLI 重建命令。
- [Risk] Implementation variants 的构建成本更高。 -> 只在真实内部替换实验使用，配置变化继续走轻量 profile matrix。
- [Risk] 迁移前后指标不可直接比较。 -> 旧结果标记 non-acceptance，使用相同 TUI path 重新建立 baseline。
- [Risk] 某些 toggles 同时控制多个职责。 -> 先审计 owning responsibility，拆为真实 config 或独立 revision，不复制含混 group switch。

## Migration Plan

1. 清点所有 toggles、presets、runtime consumers、CLI callers、metrics 和 reports，按 config/revision/remove 分类。
2. 依赖平台补齐 effective config facts、usage/timing 和 ablation report delta。
3. 建立并真实尝试 configuration 与 implementation pilot，记录真实 TUI、隔离、质量和 no-fallback 证据或基础设施阻塞。
4. 按明确清理决定删除 CLI `experiment`、direct `AgentSession` factory、runner、presets、marker/no-op branches 和 exports；阻塞 pilot 不得被改写为行为验收通过。
5. 迁移或重写 tests，运行 Agent package、evaluation harness、real focused ablation、legacy/unused 和 architecture gates。
6. 更新 Agent architecture，显式替换“experiment utility 可独立保留”的旧结论。

Rollback 只能恢复尚未删除的开发脚本提交，不得恢复产品 CLI、direct-session owner、marker 或旧报告成功路径。

## Open Questions

- 哪些现有 toggle 已经是公开支持的 session configuration，需要在 inventory 中逐项确认。
- implementation ablation 的 worktree/build helper 是否与 Prompt optimization 共用，需由平台外部 tooling 做复用审计。
