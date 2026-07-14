# Verification Evidence

## Scope and Ownership

- Ablation authoring, matrices, isolated builds, aggregation and delta reports
  are owned by `scripts/agent-eval`.
- Every sample calls the existing `runV2Case` TUI driver. No direct
  `AgentSession` runner, runtime flag, marker, alias, Market version or second
  sample report schema was added.
- `.neko/experiments` is classified as ignored, rebuildable developer output.
  No user project, setting, Skill publication state or creative artifact is
  deleted or migrated.

## Key-free Evidence

- Strict plans reject unrelated multi-dimension variants, Cartesian matrices,
  eval-only flags, missing effective/build evidence, Host identity drift and
  Market version fields.
- Ablation authoring rejects plan/scenario rubric mismatches before TUI launch.
  `hard-gates-only` remains `not-evaluated`; only retained real Judge samples
  can produce `available` content quality or `qualityMean`. Format/schema/path
  gates and execution-efficiency metrics cannot be projected as content quality.
- Configuration matrix tests prove profile hash selection, repeated TUI sample
  invocation, effective digest requirements, comparability and delta reports.
- Isolated-build tests use real Git worktrees and cover patch/source/recipe
  identity, distinct executables, cleanup, timeout, failed build and cross-run
  contamination.
- Implementation matrix tests prove build identity stays outside TUI selection,
  blind Judge uses identity-only Skill projection, every worktree is cleaned,
  and unchanged executable/config drift becomes non-comparable.

## Real Configuration Pilot

Command:

```bash
NEKO_DEBUG_COMMAND='./node_modules/.bin/tsx packages/neko-agent/packages/cli-tui/src/cli.tsx' \
  NEKO_AGENT_EVAL_JUDGE_ENDPOINT='<OpenAI-compatible base URL>' \
  NEKO_AGENT_EVAL_JUDGE_API_KEY='<redacted>' \
  node scripts/agent-eval/ablation/run.mjs \
  --plan thinking-budget \
  --run-id thinking-budget-content-judge-20260713
```

- Plan: `thinking-budget-pilot`; variants `thinking-0` and `thinking-128`;
  three samples each; suite rubric
  `rubrics/constrained-teaser-answer-quality.json`; all six samples used
  `nekoapi-chat:gpt-5.5` through independent source TUI sessions.
- All 24 deterministic hard gates passed. `thinking-0` retained digest
  `sha256:4fd7df...836fe` for all three samples; `thinking-128` retained
  `sha256:cde3b2...490b2`, proving the requested configuration delta without
  active/default fallback.
- The blind rubric Judge used `openai:gpt-5-mini` through the configured
  OpenAI-compatible endpoint. Its endpoint and credential were mapped only into
  the Evaluation child process and were not written to reports or repository
  configuration. All six Judge results were eligible. `thinking-0` scored
  `5.0` mean with `0` variance; `thinking-128` scored `4.9` mean with `0.02`
  variance. The observed `qualityMean` delta is `-0.1`; with only three samples
  per variant and a near-saturated rubric, this is descriptive output-content
  evidence, not a causal claim that the 128-token budget reduces quality.
- The observed p50 latency was 21004 ms for `thinking-0` and 19084 ms for
  `thinking-128`; iteration totals were 234 and 241. Provider token/cost facts
  were unavailable. These remain execution-efficiency observations and are not
  used to derive the content score.
- The matrix outcome is `pass`. Every sample, Judge report and assertion is
  retained; no successful-run selection or hard-gate-to-quality projection was
  used. Residual variance requires more independent runs and broader cases
  before making a stability or general model-performance claim.
- Raw delta:
  `reports/agent-eval/ablation/thinking-budget-pilot/thinking-budget-content-judge-20260713/variant-delta.json`.

Earlier attempts exposed and retained product defects rather than being counted
as samples: source Assets ESM named-export failure, external-workspace locator
rejection, swallowed initialization failure and partial runtime profile fields
overwriting defaults with `undefined`.

## Real Implementation Pilot

Command:

```bash
node scripts/agent-eval/ablation/run.mjs \
  --plan creation-persona-guidance \
  --run-id creation-persona-pilot-after-entrypoint-fix-20260713
```

- Plan: `creation-persona-guidance-pilot`; three samples for the canonical
  `creation-persona` and three for an isolated patch removing only rationale
  and Draft-presentation guidance. The user prompt and invariant hard gates no
  longer require the removed rationale method; content differences are owned by
  `rubrics/rain-station-draft-quality.json`.
- Host identity remained `builtin/builtin-skills/creation-persona`. Skill
  fingerprints were `sha256:9c2afd...85c34` and
  `sha256:e2f33f...4d450`; executable fingerprints were
  `sha256:7d1fa6...407be` and `sha256:bdab0b...fac5b`.
- The fingerprinted external recipe now bundles both variants to canonical
  `dist/cli.js`. A raw fixed-revision probe returned a real `session.create`
  result and `session.dispose`; the prior `cli.bundle.js` recipe only loaded and
  exited because the revision's main guard did not recognize that filename.
- All six isolated samples reached `nekoapi-chat:gpt-5.5`, and both detached
  worktrees were removed and pruned. The selected revision predates the current
  v2 effective-config and collection-completeness facts, so every sample is
  correctly `configuration-invalid`; the current hard gates cannot accept its
  otherwise real output.
- Content quality remains `unavailable`. The implementation variants are not
  comparable until a stable development checkpoint contains the current facts
  contract. The Judge path is now available, but a dirty working-tree snapshot
  is not substituted for that checkpoint.
- Raw delta:
  `reports/agent-eval/ablation/creation-persona-guidance-pilot/creation-persona-pilot-after-entrypoint-fix-20260713/variant-delta.json`.

## TUI Startup And Product Path

- Source `tsx` CLI and the current tsup `dist/cli.js` both reached the canonical
  TUI owner and real model. Current source and a repeated built sample passed all
  four single-message hard gates; another built sample returned a real empty
  provider output and is retained as output-variance evidence.
- `neko-assets/agent-headless` now has an explicit ESM source subpath without
  converting the VS Code extension CJS main. CLI bundling includes raw
  `@neko/markdown`, preserves `node:` protocol, splits Node/Bun SQLite modules,
  and provides ESM `createRequire` for CJS dependencies.
- Initialization errors now fail immediately with the owning diagnostic.
  Evaluation only propagates the allowlisted protocol `details.diagnostic`, not
  arbitrary detail objects. Workspaces outside `${HOME}` use the shared relative
  locator contract instead of persisting absolute paths.

## Removal Gate

The configuration pilot is green with real content-quality evidence, while the
implementation pilot remains configuration-invalid. On 2026-07-13 the user
explicitly directed removal of the old path despite that implementation-pilot
blocker. `neko experiment`, the direct `ExperimentRunner`, presets/reporter,
public exports, `__ablation` marker, runtime ablation DTOs and experiment-only
Skill/Tool/hook/session branches are therefore deleted with CLI/export/source
poison coverage. This does not convert the implementation pilot into behavior
acceptance. Release and Market publication remain outside this change.

## Removal Validation

- `pnpm test:agent:eval`: 30 files and 201 tests passed; all 26 suites and 37
  indexed cases passed strict key-free dry-run.
- Focused Agent session/Skill/Tool/runtime tests: 10 files and 225 tests passed.
- CLI startup/config focused tests: 4 files and 35 tests passed; Assets ESM
  provider tests: 1 file and 3 tests passed. Help and aliases contain no
  experiment command. `pnpm --filter @neko/cli build` and `build:bundle` passed.
- AI SDK multimodal policy test: 1 file and 13 tests passed.
- Agent/Evaluation poison tests passed and production scans found no retired
  runner, marker, runtime flag, CLI registration or direct-session import.
- Strict OpenSpec validation and `git diff --check` passed.
- `pnpm check:agent-boundaries` no longer reports the deleted experiment LCD
  fixture; it remains red only for existing expired exceptions and an unrelated
  `cachePath` test finding.
- `pnpm check:legacy-debt` remains red with 111 existing `migrate-now` or
  `needs-review` occurrences, while `delete-now` is zero. `pnpm check:unused`
  still aborts on the existing Knip `ENOTDIR` path for the Bun SQLite test file.
- Agent/Agent-types/CLI typechecks previously remained red from concurrent
  repository errors; the new startup/config changes are covered by focused
  red/green tests and the CLI build.
- The current built CLI reaches Commander for `--help` and the full debug
  automation path. The fixed historical implementation target also answers a
  raw `session.create` after converging its recipe on canonical `dist/cli.js`.
