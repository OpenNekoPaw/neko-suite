## 1. Dependency and Ablation Inventory

- [x] 1.1 Verify `establish-agent-evaluation-platform` provides runtime profile, effective-config facts, repeated samples, comparison and real TUI reporting; do not create temporary ablation infrastructure when absent.
- [x] 1.2 Inventory every `AblationToggles` field, preset, group/parameter suite, `applyAblationToggles` consumer, marker/no-op branch, `ExperimentRunner` caller/export, CLI command, metric, report, fixture and test.
- [x] 1.3 Classify each toggle/preset as supported runtime configuration, isolated implementation revision, obsolete or not applicable, with owner and migration evidence.
- [x] 1.4 Define ablation suite/variant delta schemas using platform contracts for expected path, forbidden fallback, Host Skill identity/base-variant fingerprints, config/build identity, metrics and rubric.
- [x] 1.5 Add key-free authoring tests rejecting mixed unrelated dimensions, unbounded Cartesian matrices, eval-only runtime flags and missing effective-config/build evidence.

## 2. Configuration Ablation Through Canonical Profiles

- [x] 2.1 Audit canonical Agent/TUI configuration for model/profile, thinking/output budgets, execution mode, context/memory policy and Skill/Capability enabled state; keep only real supported settings.
- [x] 2.2 Migrate valuable configuration variants into platform ablation suites with baseline + single-dimension defaults and explicit interaction variants only where evidenced.
- [x] 2.3 Execute configuration variants as isolated TUI sessions and assert requested/effective configuration identity/digest with no active/default fallback.
- [x] 2.4 Separate correctness hard gates, execution-efficiency metrics and real-output content quality; require matching scenario rubric/Judge evidence before producing quality availability or deltas.
- [x] 2.5 Run a real configuration-ablation pilot and record provider/model, fixture, effective config, report location and residual variance.

## 3. Implementation Ablation Through Isolated Builds

- [x] 3.1 Reuse or establish the external isolated revision/worktree/build contract shared with Prompt optimization; do not add Agent runtime experiment composition.
- [x] 3.2 Recreate at least one non-configurable Skill-related preset as base and isolated implementation variant using the same Host Skill identity, distinct fingerprints, TUI driver and comparable policies, without reintroducing the ablated guidance in the prompt or invariant hard gates.
- [x] 3.3 Prove variant/build identity remains external to TUI facts and hidden from blind Judge while the effective runtime path remains observable.
- [x] 3.4 Add cleanup, timeout, failed-build, non-comparable and cross-run contamination tests for implementation variants.
- [ ] 3.5 Run a real implementation-ablation pilot with hard gates, quality comparison and no-marker/no-fallback evidence.

## 4. Remove Internal Experiment Ownership

- [x] 4.1 Disconnect and delete the CLI `experiment` command, human presentation, runtime classification and tests; prove the old command fails visibly and has no alias.
- [x] 4.2 Remove direct `AgentSessionFactory` experiment assembly, `ExperimentRunner`, suite presets, aggregation/comparison/report writer and public exports after the explicit cleanup decision; retain blocked pilot evidence as residual risk.
- [x] 4.3 Remove `AblationMarkerHook`, `__ablation`, apply/extract helpers and all experiment-only no-op branches from session, Skill, Tool, memory, Prompt and runtime paths.
- [x] 4.4 Migrate reusable raw measurement points to neutral runtime facts/hooks only when they have a real TUI/diagnostic consumer; delete experiment-only metrics abstractions otherwise.
- [x] 4.5 Add poison/export/debt tests proving removed commands, imports, marker fields and direct-session paths cannot return success.
- [x] 4.6 Remove or reclassify old `.neko/experiments` fixtures/reports as rebuildable developer outputs; do not promote them to acceptance baselines or delete user creative data.

## 5. Documentation, Architecture Replacement, and Validation

- [x] 5.1 Update Agent architecture to replace the prior independent experiment-utility allowance with Evaluation-owned ablation and one TUI session owner.
- [x] 5.2 Update Evaluation README, ablation authoring guidance, CLI docs, completion/help snapshots and migration notes; remove instructions for old commands and internal presets.
- [x] 5.3 Run focused Agent session/Skill/Tool/config tests, CLI command surface tests, `pnpm test:agent:eval`, real configuration and implementation ablation pilot attempts, affected builds, boundary checks and strict OpenSpec validation; retain pilot infrastructure failures and missing content-quality samples as blocked behavior evidence.
- [x] 5.4 Run `pnpm check:legacy-debt` and `pnpm check:unused`, classifying only unrelated existing failures and proving no retained ablation fallback or duplicate runner.
- [x] 5.5 Run `neko-quality-review` and record L3 risks, breaking command/export impact, ignored/rebuilt report strategy, pilot evidence, missing real-output Judge samples, unexecuted matrices and remaining performance/content-quality variance.
- [x] 5.6 Fix the confirmed source/built TUI ESM startup blockers at owning package/build boundaries, add product-path regression tests, and keep the implementation variants on one fingerprinted external build recipe.
