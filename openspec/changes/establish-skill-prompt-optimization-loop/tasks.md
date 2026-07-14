## 1. Platform Dependency and Existing Optimization Audit

- [x] 1.1 Verify `establish-agent-evaluation-platform` provides stable report, evidence, baseline, comparison, Host Skill identity/fingerprint, suite-selection and real TUI capabilities; block this change rather than building temporary substitutes when they are absent.
- [x] 1.2 Inventory current Prompt/Skill optimization scripts, documents, candidate artifacts, provider adapters, report consumers, Skill identity projections, history stores and any automatic mutation path.
- [x] 1.3 Define strict schemas for optimization plan, candidate artifact, ownership handoff, approval/rejection, iteration budget and candidate acceptance decision.
- [x] 1.4 Add key-free validators rejecting missing evidence refs, incomplete Host identity, stale fingerprints, unsupported owners, unauthorized targets, secrets and unbounded iteration policies.

## 2. Skill Identity and Development History

- [x] 2.1 Reuse portable Skill name and Host projection source/provenance/rootId/relativePath/fingerprint as the only Skill development identity and snapshot inputs; do not add semver or a second content hash.
- [x] 2.2 Define immutable development history checkpoints for baseline, candidate, evaluated, accepted, rejected and superseded states with parent lineage, origin, report ids, actor/time and residual risk.
- [x] 2.3 Store development history outside `SKILL.md` and `agents/neko.yaml`; prove Market package id/version/publication/installation fields cannot enter or be mutated by the history path.
- [x] 2.4 Implement explicit rename/move lineage and fail-visible ambiguity handling; prohibit automatic merge by name, active source, content similarity or fingerprint alone.
- [x] 2.5 Create checkpoints only for explicit Evaluation/development events, not every filesystem save; retain the current Host fingerprint for the next checkpoint.
- [x] 2.6 Add identity/history contract tests for same-name sources, changed fingerprint, stale approval, rename/move, missing parent, immutable earlier entries and Market-boundary poisoning.

## 3. Report Intake and Ownership Gate

- [x] 3.1 Implement report intake using platform report ids and sanitized evidence projections rather than raw hidden prompts/logs.
- [x] 3.2 Implement owner gating for Skill content, public description, Prompt guidance and confirmed Prompt routing; route Tool/Capability, Runtime/Session, Provider, Artifact and Evaluation failures to handoff/blocker results.
- [x] 3.3 Preserve observed failure, suspected owner, confidence and missing-evidence distinctions through every optimization artifact and history checkpoint.
- [x] 3.4 Add synthetic report tests for confirmed Prompt defects, ambiguous attribution, wrong owner, infrastructure failure and hard-gate failure.

## 4. Candidate Planning and Human Approval

- [x] 4.1 Generate `optimization-plan.md` and candidate patch artifacts with Skill identity, base/candidate fingerprints, evidence, expected improvement, risks, budgets and required regression matrix outside canonical paths.
- [x] 4.2 Add redaction tests proving candidates and plans exclude hidden prompts, credentials, unauthorized source and optimizer-hidden holdout inputs.
- [x] 4.3 Implement explicit approve/reject records bound to Skill identity, base/candidate fingerprints, approver, scope, budget and required matrix.
- [x] 4.4 Invalidate approval when candidate fingerprint, base fingerprint, identity, scope, budget or required matrix changes.
- [x] 4.5 Require approved application to enter the normal OpenSpec/apply workflow; add poison tests proving the optimizer cannot edit or commit canonical Skill content directly.

## 5. Isolated Baseline and Candidate Execution

- [x] 5.1 Audit existing worktree/build helpers and define one external isolated target contract shared with implementation ablation without importing Agent internals.
- [x] 5.2 Implement baseline and candidate revision/worktree/build preparation, fingerprint verification, fixture isolation, target identity recording and deterministic cleanup.
- [x] 5.3 Execute both targets through platform TUI suites with identical comparable runtime/model/sampling/budget/validator/Judge policies.
- [x] 5.4 Implement randomized blind A/B evidence projection that hides checkpoint labels, revision/build identities and repository diffs from Judge.
- [x] 5.5 Return non-comparable when identity, fingerprints or target policies cannot be matched; prohibit historical aggregate or final-text-only substitutes.

## 6. Holdout, Regression, Budgets, and Candidate Acceptance

- [x] 6.1 Implement optimizer-hidden holdout selection and ensure holdout inputs/results never enter optimizer context before candidate finalization.
- [x] 6.2 Run all applicable canonical, negative, artifact, quality and protected regression cases for approved candidates.
- [x] 6.3 Reject candidate acceptance on hard-gate, holdout or protected regression failure regardless of average Judge improvement.
- [x] 6.4 Enforce candidate count, iteration count, timeout, target/controller/Judge token/cost and no-improvement limits with behavior failures never retried into success.
- [x] 6.5 Append accepted/rejected development history checkpoints linked to baseline/candidate reports, blind order, holdout/regression evidence, approver and residual risk.
- [x] 6.6 Add end-to-end key-free state-machine tests using synthetic reports and isolated fake targets without allowing canonical mutation or Market state writes.
- [x] 6.7 Reuse Evaluation cost availability in optimization budget usage; block decisions when provider cost is unavailable and add regression tests proving missing cost cannot become zero-cost success.

## 7. Pilot, Documentation, and Quality Review

- [ ] 7.1 Complete one real human-approved Skill Debug Functional pilot from baseline fingerprint through candidate plan, normal apply, blind/holdout/regression Evaluation and accepted or rejected history checkpoint.
- [x] 7.2 Update `.codex/skills/neko-agent-evaluation` with identity/history, attribution and optimization methodology only; keep commands, schema and execution protocols in external documentation.
- [x] 7.3 Update local Skill development Debug Functional evidence guidance, explicitly route package/version/publication concerns to Market, and add content-boundary regression tests for Skill prompt protocol leakage.
- [ ] 7.4 Run identity/history/optimizer schema and state tests, affected platform tests, real focused pilot, `pnpm test:agent:eval`, legacy/unused/quality gates and strict OpenSpec validation. Require change-scoped gates to pass; attribute and route repository-wide failures to their owning changes without expanding this change, and do not complete this task before the real pilot runs.
- [x] 7.5 Run `neko-quality-review` and record identity/fingerprint lineage, model/Judge identities, costs, holdout handling, unexecuted cases and remaining bias/overfitting risk.
