# Existing Surface and Reuse Audit

## Five-layer analysis

| Layer          | Finding                                                                                                                                                        | Target ownership                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Evaluation already owns reports, evidence, Judge, baseline and comparison. No repository Prompt optimizer or canonical auto-mutation path exists.              | Add only external optimization planning, approval, history and orchestration under `scripts/agent-eval/`.                         |
| Dependency     | `runV2Case` drives the canonical TUI; `prepareIsolatedBuildTarget` owns detached Git worktree/build cleanup; suite discovery owns target and policy selection. | Optimization depends on these external modules and never imports Agent runtime internals.                                         |
| Interface      | Result/evidence/failure-attribution v2 and Host Skill `name/source/provenance/rootId/relativePath/fingerprint` are stable inputs.                              | New contracts reference report ids and sanitized evidence; they do not copy raw prompt/log/provider bodies.                       |
| Extension      | `randomized-comparator` and ablation implementation targets are the existing variation points.                                                                 | Extend them with optimization-specific approval, holdout and acceptance policy instead of adding runtime flags or another runner. |
| Testing        | Evaluation has strict schema tests, fake isolated Git target tests, all-suite dry-run and real TUI execution.                                                  | Add key-free state-machine tests, then one real human-approved Skill pilot.                                                       |

## Inventory

| Surface                           | Current state                                                  | Decision                                                                                                |
| --------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Prompt/Skill optimization scripts | None                                                           | Create external optimization modules; no product command or Agent Skill.                                |
| Candidate artifacts               | Implementation ablation has a fingerprinted patch fixture only | Reuse patch fingerprint/build isolation; add read-only plan/candidate metadata outside canonical paths. |
| Provider/Judge adapters           | `judge/provider-adapter.mjs` and suite-owned rubrics           | Reuse; do not add an optimizer-specific provider adapter.                                               |
| Report consumers                  | runner, baseline/comparison and ablation aggregation           | Intake only validated result/evidence/attribution ids and sanitized projections.                        |
| Skill identity                    | Host projection and v2 suite target                            | Reuse the full Host identity and package fingerprint; no semver or name-only lookup.                    |
| History stores                    | No Skill development history store                             | Add immutable explicit checkpoints in Evaluation/quality metadata, outside portable Skill packages.     |
| Isolated targets                  | `ablation/isolated-build-target.mjs`                           | Reuse as the sole revision/worktree/build owner.                                                        |
| Randomized comparison             | `comparison/randomized-comparator.mjs`                         | Reuse order randomization; add an allowlisted output projection that hides revision/labels/diffs.       |
| Automatic mutation/commit         | None                                                           | Preserve absence and add poison tests; application returns an OpenSpec handoff only.                    |
| Market version/publication        | Owned by Neko Market                                           | Reject these fields from optimization and history contracts.                                            |

## Platform dependency

`establish-agent-evaluation-platform` currently provides strict v2 result,
evidence, suite, baseline, comparison, failure attribution, Host Skill identity,
index-backed suite selection, repeated real TUI execution and sanitized reports.
`converge-agent-ablation-into-evaluation-platform` adds the reusable isolated
build target and proves its cleanup/fingerprint behavior. No temporary runner,
Judge, report or identity substitute is required for this change.
