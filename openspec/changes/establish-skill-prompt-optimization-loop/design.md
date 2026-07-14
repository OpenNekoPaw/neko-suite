## Context

该 change 依赖 `establish-agent-evaluation-platform` 已提供 v2 suites、真实 TUI execution、hard gates、Judge、reports、baseline 和 comparison primitives。优化流程的职责不是再次执行 Agent，而是把已证实的 Prompt/Skill 质量问题转为可审阅候选，并通过正常仓库变更与平台复测决定是否接受该开发候选。

## Goals / Non-Goals

**Goals:**

- 从 evidence-linked quality report 生成范围明确的 Prompt/Skill 优化候选。
- 使用既有 Host identity/fingerprint 建立可审计的本地 Skill development checkpoints 和 lineage。
- 保持人工批准、隔离执行、blind comparison、holdout 和 regression。
- 阻止用 Prompt 修改掩盖 routing、tool、runtime、provider 或 artifact 缺陷。

**Non-Goals:**

- 不复制 Evaluation runner、Judge、reporter、baseline store 或 artifact validator。
- 不自动编辑或提交 canonical Skill，也不把候选接受等同于产品发布。
- 不把 optimizer 作为 Agent product capability、Dashboard action 或 runtime Skill。
- 不拥有 Market package id、semver、发布、安装、分发或 Market 版本历史。

## Decisions

### 1. Optimization 只接受可优化归因

输入必须引用平台 report id、failed/regressed cases、observed evidence、suspected owner 和 confidence。只有 Skill content、公开 description、Prompt-owned method guidance 或被独立证据确认的 Prompt routing 才能创建候选。其他 owner 生成 OpenSpec handoff suggestion 或 blocker，不生成 Prompt patch。

### 2. Skill identity 与开发历史复用 Host SSOT

本地 Skill identity 使用 portable `name` 加 Host projection 的 `source/provenance/rootId/relativePath`。完整 canonical package 的 Host-computed `fingerprint` 标识一个开发内容快照，不新增第二套 hash，也不把 frontmatter/package semver 当作本地开发身份。

Development history 只记录显式 checkpoint，而不是每次文件保存：当当前 fingerprint 被用作 Evaluation baseline、生成 candidate、完成 Evaluation 或作出接受/拒绝决定时写入 entry。Entry 包含 identity、fingerprint、parent fingerprint/entry、origin、evidence report ids、decision、actor/time 和 residual risk。名称或 location 变化创建新 identity，只有显式 rename/move lineage 才能关联，禁止按同名或内容相似度自动合并。

History 属于 Host/Evaluation development metadata，不写入 `SKILL.md` 或 `agents/neko.yaml`。Market 可以在未来引用 accepted fingerprint 创建 package/version，但该映射不属于本 change。

### 3. 候选是外部 artifact，不是 runtime mutation

Optimizer 输出 `optimization-plan.md`、candidate patch、target hashes、expected improvement、risk、budget 和 required matrix。Artifacts 位于 gitignored run directory 或经审阅的 OpenSpec evidence 目录，默认不应用到工作树。

拒绝让 target Agent 自改 Skill，也拒绝在 TUI facts 中加入 candidate checkpoint 状态；TUI 只投影 Host identity/fingerprint，blind Judge 不接收 base/candidate 标签。

### 4. 人工批准是显式状态转换

状态机为：

```text
reported -> proposed -> approved/rejected
approved -> applied-through-OpenSpec -> evaluated
evaluated -> accepted/rejected
```

每次状态转换追加 development history checkpoint。批准记录绑定 Skill identity、base/candidate fingerprint、approver、scope、预算和 required matrix。应用必须走正常 OpenSpec/apply；candidate fingerprint 变化后旧批准失效。

### 5. Baseline 与 candidate 使用隔离 revision/worktree/build

Blind A/B 需要两个真实可执行目标。Runner 在外部记录 base/candidate fingerprint、repository revision 和 build identity，为每个样本创建隔离 workspace，并通过相同 TUI debug automation path 执行。Judge 只看到随机化的 A/B evidence projection，不看到 checkpoint label、revision 或 diff。

若无法用相同 fixture、model/profile、sampling、budget、validator 和 Judge policy 重跑，则平台返回 non-comparable，不允许用历史聚合冒充 blind comparison。

### 6. Holdout 与 regression 不进入 optimizer 上下文

Optimizer 只能读取开发 cases 和允许的质量报告。Holdout selection、inputs 和结果由平台 policy 在候选确定后提供；existing regression 全量运行。任何 hard-gate、holdout 或 protected regression 回退都拒绝接受候选，即使平均 Judge 分提升。

### 7. Iteration 有预算和停止条件

每轮限制 candidate count、iteration count、target/controller/Judge tokens、provider cost、wall time 和连续无提升次数。Infrastructure retry 与 behavior rerun 分开；case failure 不自动重试成绿色，也不从失败候选中选择“最不差”作为成功。

成本使用量复用 Evaluation repeated-run 的 `available/totalUsd | unavailable` 投影。缺少 provider 成本证据时，候选 decision 必须为 `blocked`，不得把 unavailable 强制转换为 `0` 或借此通过 cost budget。token 数仍使用平台当前标准 usage 事实；若对应事实不完整，必须由 hard gate/evidence completeness 阻止接受。

### 8. Skill 方法论不承载执行协议

`.codex/skills/neko-agent-evaluation` 只描述何时优化、如何解释报告、如何归因、如何审阅候选和残余风险。具体命令、schema、worktree orchestration、provider 参数与 report paths 属于 `scripts/agent-eval` README/catalog，防止工具协议回流 Skill content。

## Risks / Trade-offs

- [Risk] Optimizer 对公开 cases 过拟合。 -> 隐藏 holdout、全量 regression、重复采样和候选上限。
- [Risk] Judge 偏好措辞变化而非真实质量。 -> hard gates 独立、blind order、领域 rubric、不同 Judge model 优先和人工审阅。
- [Risk] Worktree/build 成本增加。 -> 只对批准候选运行 focused matrix，缓存不可作为 durable identity，失败清理显式执行。
- [Risk] Provider 不返回成本。 -> 保留 `unavailable`，阻止候选接受；不得用零成本占位。
- [Risk] 错误归因导致修改错误层。 -> 报告区分事实与假设，低置信或非 Prompt owner 只能 handoff/block。

## Migration Plan

1. 平台完成 report/baseline/comparison capability 后，定义 optimization-plan、candidate 和 approval schemas。
2. 复用 portable Skill/Host projection 定义 development history entry、identity/fingerprint lineage 和显式 rename/move 规则。
3. 实现 report intake 与 owner gate，先用 synthetic reports 做 key-free 状态机测试。
4. 实现隔离 revision/worktree execution、blind projection、holdout/regression selection 和 budget controls。
5. 完成一个人工批准的 Skill pilot，记录 fingerprint checkpoints 与 accepted/rejected history。
6. 更新 Codex Skill、开发调试指南和 Evaluation evidence；删除旧 change 中重复的 optimizer tasks/contract。

Rollback 删除未接受的 candidate worktree 并保留报告/patch artifact；不得回退为自动修改 canonical Skill 或 final-text-only comparison。

## Open Questions

- 隔离构建由现有 workspace tooling 还是专用脚本负责，需在实现前做复用审计。
- Holdout 首版是提交但由 policy 隐藏，还是由 trusted CI 注入；隐藏不应被描述为安全保密。
