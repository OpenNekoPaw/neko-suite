# L3 Quality Review Evidence

## Risk and Findings

Risk level: **L3**. The change affects the Agent Evaluation workflow, TUI debug
fact contract, external executable selection, Skill identity evidence and
developer build orchestration. It does not change release, installation,
Market publication, Webview UI, Proto or Rust Engine behavior.

Blocking acceptance findings:

1. The current-source configuration matrix reaches `nekoapi-chat:gpt-5.5`,
   retains six real outputs, passes 24/24 hard gates and observes stable distinct
   effective digests. Six eligible blind `openai:gpt-5-mini` rubric results now
   provide output-content quality evidence: `thinking-0` mean `5.0`,
   `thinking-128` mean `4.9`, delta `-0.1`. Three samples per variant and rubric
   saturation are insufficient for a causal or general quality claim; latency
   and iteration deltas remain separate efficiency evidence.
2. Both detached implementation builds now answer real debug automation and
   reach the configured model with distinct executable/Skill fingerprints.
   Their fixed revision predates the current v2 effective-config and collection
   completeness facts, so all six samples are configuration-invalid. A stable
   development checkpoint with the current evidence contract is required before
   the Skill output comparison can run.
3. The user explicitly selected immediate old-path removal despite incomplete
   content-quality acceptance. `neko experiment`, `ExperimentRunner`, presets,
   marker/runtime switches and experiment-only no-op branches remain removed
   with poison tests. This valid prelaunch cleanup decision does not convert the
   blocked Judge or historical-checkpoint samples into acceptance evidence.

No remaining blocking defect was found in the new external contracts or
key-free execution path. Review initially found that Judge `promptHash` was
incorrectly treated as a comparability policy field even though it includes the
candidate output; this would make valid base/variant outputs non-comparable. It
was removed from policy comparison while remaining in every Judge report for
reproducibility, with a regression test for differing output hashes and stable
Judge policy.

## Architecture Review

- Responsibility: Agent/TUI owns one real session lifecycle and neutral facts;
  `scripts/agent-eval` owns strict plans, matrices, worktrees, aggregation,
  comparison and reports.
- Dependency: the external layer imports `runV2Case`; it does not import
  `@neko/agent`, construct `AgentSession`, or use product experiment exports.
- Interface: configuration plans allow only canonical debug settings/model
  profiles. Implementation plans require source, patch, build, executable,
  Host Skill and development checkpoint identities. Both plan modes must match
  the indexed scenario rubric/Judge contract before execution.
- Extension: the isolated build target is shared external tooling suitable for
  the Prompt optimization loop. New dimensions extend plan schemas without
  adding runtime flags or session owners.
- Testing: strict authoring, matrix orchestration, real Git worktrees, cleanup,
  timeout, build failure, contamination, non-comparability, blind Judge and
  report retention have deterministic coverage. Quality projection tests prove
  hard-gate/format success cannot become a quality score, Judge sample counts
  match aggregates and only actual rubric scores produce `qualityMean`. Real
  behavior is explicitly blocked rather than substituted with mocks.

The implementation is proportionate to a local developer platform: one matrix
layer, one reusable worktree helper and the existing runner/report pipeline.
Unknown fields, mismatched identities, missing facts and cleanup failures are
fail-visible. No broad runtime fallback or defensive success default was added.

## Breaking and Data Impact

The `neko experiment` command, Agent root experiment exports, runtime ablation
DTOs and marker/no-op paths are removed. No alias, compatibility shim or new
product command was added; developer ablation now has one external Evaluation
entrypoint.

`.neko/experiments` is ignored, rebuildable developer output. It is not promoted
to an acceptance baseline and no user project, setting, Skill development
history, creative artifact or Market state is deleted. Raw new reports remain
under gitignored `reports/agent-eval/`; committed evidence contains only stable,
redacted identities and diagnostics.

## Verification

Passed:

- `pnpm test:agent:eval`: 30 files, 201 tests; 26 suites and 37 cases strict
  dry-run.
- Focused Agent session/Skill/Tool/runtime tests: 10 files, 225 tests.
- CLI command-surface tests: 1 file, 6 tests; focused Agent and Evaluation
  poison tests also passed.
- AI SDK multimodal policy test: 1 file, 13 tests.
- Focused debug/ablation/runner tests: 8 files, 54 tests; final focused TUI
  debug rerun: 2 files, 19 tests.
- Post-review ablation and Judge tests: 6 files, 35 tests, plus the external
  ownership guard.
- CLI startup/config regression set: 4 files, 35 tests; Assets ESM provider set:
  1 file, 3 tests.
- `pnpm --filter @neko/cli build` and `pnpm --filter @neko/cli build:bundle`
  succeeded. Both built `dist/cli.js --help`; the split bundle also answered a
  real partial-profile `session.create` outside `${HOME}` and disposed cleanly.
- `openspec validate converge-agent-ablation-into-evaluation-platform --strict`.
- `git apply --check` for the isolated creation-persona patch.
- `git diff --check`.

Real behavior evidence:

- Current-source configuration pilot
  `thinking-budget-content-judge-20260713`: six model outputs, 24/24
  deterministic gates, six eligible rubric Judge results and two comparable
  content-quality distributions passed. Delta location and residual variance
  are recorded in `verification.md`.

Attempted and blocked:

- Isolated implementation pilot
  `creation-persona-pilot-after-entrypoint-fix-20260713`: two successful builds,
  six real model calls and complete cleanup; every sample is
  configuration-invalid because the historical revision lacks the current v2
  facts contract. Delta location and fingerprints are recorded in
  `verification.md`.
- CLI and Agent TypeScript checks: many concurrent repository errors remain in
  Agent tests, perception/media types, task scope fixtures, artifact projection
  and other unrelated files. No new diagnostic was reported in the changed
  startup/config/locator/runner files.
- `pnpm check:agent-boundaries`: the stale LCD reference to the deleted
  experiment fixture was removed; existing expired compatibility exceptions and
  an unrelated `cachePath` test finding remain.
- `pnpm check:legacy-debt`: 111 existing blocking
  `migrate-now`/`needs-review` occurrences; `delete-now` is zero and direct
  scans found no retained experiment runner, marker, runtime flag or CLI path.
- `pnpm check:unused`: Knip aborts with an existing `ENOTDIR` configuration path
  for `bun-sqlite-local-metadata-store.bun.test.ts`.

## Residual Risk

- The configuration pilot has a valid content-quality delta, but three samples
  per variant on one near-saturated rubric do not establish statistical
  significance, causal effect or quality across broader tasks. Its latency and
  iteration deltas remain descriptive efficiency evidence only.
- The implementation pilot retains quality as `unavailable`; this is not
  evidence that either implementation variant is better.
- The implementation plan is pinned to source revision
  `70d98e5074fd6963c752ce43c269bf6d3a74a2b6`, which lacks the current evidence
  contract. Any accepted source update must first form a stable checkpoint and
  refresh source, patch, recipe and Skill fingerprints together.
- Only focused `thinkingBudget` and creation-persona guidance matrices are
  authored. Other legacy presets remain classified inventory, not migrated
  behavior evidence.
- CLI, Agent source/export and external Evaluation ownership poison tests now
  prevent the removed command, marker and direct-session runner from returning.
