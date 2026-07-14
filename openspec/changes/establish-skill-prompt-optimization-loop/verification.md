# Verification

## Deterministic contracts

- `uv run --with pyyaml ${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py .codex/skills/neko-agent-evaluation`: passed.
- `pnpm exec vitest --config vitest.config.ts --root packages/neko-agent/packages/agent --run src/skill/__tests__/skill-prompt-content-boundary.test.ts`: 1 file, 2 tests passed.
- `pnpm exec vitest --config vitest.agent-eval.config.mts --run scripts/agent-eval/schemas/optimization-contracts.test.mjs scripts/agent-eval/optimization/*.test.mjs`: 9 files, 59 tests passed. This includes truthful blocked evidence, atomic history batches, persisted-lineage validation, continued candidate lineage, decision binding, and fail-visible unavailable provider cost.
- `pnpm test:agent:eval`: 39 files, 263 tests passed; all 26 indexed suites and 38 cases passed key-free dry-run. This is harness evidence, not real Agent behavior acceptance.
- `openspec validate establish-skill-prompt-optimization-loop --strict`: passed.

## Real Skill pilot status

The existing `creation-persona` implementation-ablation attempt cannot satisfy task 7.1:

- Source revision: `70d98e5074fd6963c752ce43c269bf6d3a74a2b6`.
- Host identity: `builtin/builtin-skills/creation-persona`.
- Baseline Skill fingerprint: `sha256:9c2afdf3044714259a7edc85671b6ac77daa9bb3c147dfe704b7b4c108085c34`.
- Variant Skill fingerprint: `sha256:e2f33fe4a83bba4ce63b7bf37c949ef5f731d690e60bf88be2fac2fd9934d450`.
- Baseline/variant executable fingerprints: `sha256:7d1fa6d4abfa1c690aff7f1cf1af091045bf6a2ff2833c3eb7dd52a57c5407be` and `sha256:bdab0b534f9d4ff831a5bd44a4c10e5b7641428595e27811d648de2b67efac5b`.
- All six target calls reached `nekoapi-chat:gpt-5.5`, but the historical revision did not expose the current effective-configuration and collection-completeness facts. Every sample is `configuration-invalid`.
- The configured comparative Judge is `openai:gpt-5-mini`; Judge execution and output-content scores were skipped, so content quality and Judge cost are unavailable.
- Raw retained evidence: `reports/agent-eval/ablation/creation-persona-guidance-pilot/creation-persona-pilot-after-entrypoint-fix-20260713/variant-delta.json`.

This was an ablation attempt, not an optimization approval record. It has no human-approved candidate artifact, normal OpenSpec application checkpoint, hidden holdout, protected regression, blind content comparison or accepted/rejected development-history checkpoint. The current suite indexes only the public canonical case and declares `repositoryRevision: working-tree`; the current working tree contains unrelated concurrent changes and cannot be promoted to a stable development checkpoint.

Task 7.1 therefore remains open. A valid pilot requires a stable current-v2 revision, a human approval bound to base/candidate fingerprints and matrix, at least one optimizer-hidden holdout, at least one protected regression case, repeated isolated real TUI runs, blind Judge comparison, and a final accepted or rejected history checkpoint.

The earlier readiness audit used repository HEAD `dfbd5248704a0c871415cc9ea94ff30df72e3e48`. TUI facts, the v2 Evaluation platform, and Ablation convergence now have stable revisions `f863f18ad`, `b94a575d5`, and `7cb2f9697`; the optimization implementation is committed with this change batch. This resolves the source-checkpoint prerequisite, but it does not execute the pilot. No `reports/agent-eval/optimization/` candidate/approval artifact, `quality/skill-development-history/` checkpoint, or valid failed/non-comparable Skill report is available, and the indexed suite still selects `repositoryRevision: working-tree`. A new pilot must bind its approval and matrix to an explicit stable revision.

## Budget evidence hardening

Optimization budget usage now reuses the Evaluation repeated-run cost projection: `available/totalUsd` or `unavailable`. An unavailable provider cost blocks the candidate decision and remains explicit in decision/history evidence; it cannot be converted to zero-cost success. Target/controller/Judge token limits continue to use the platform usage facts and evidence-completeness hard gates.

## Repository gates

- `pnpm check:legacy-debt`: failed on 133 current-worktree blocking surfaces (`migrate-now=122`, `needs-review=11`; `delete-now=0`). No blocking match was reported under the new optimization modules. Ownership remains with the affected Agent/shared/Canvas and debt-ledger changes.
- `pnpm check:unused`: completed analysis and failed on one unused Evaluation platform CLI file, five unused dependencies, five unlisted dependencies, 85 unused exports and two duplicate exports. `scripts/agent-eval/validators/file-validator-cli.mjs` and the agent-eval developer-script entry/Knip ownership route to `establish-agent-evaluation-platform`; package findings route to their owning package changes. Optimization exports remain visible because no real pilot/driver consumes the development API yet, so this change-scoped gate is not green.
- `pnpm check:quality`: release-channel validation passed, then the current legacy-debt ledger gate stopped on the same 133 unresolved surfaces.

Because the required real pilot and repository gates are not green, task 7.4 remains open.
