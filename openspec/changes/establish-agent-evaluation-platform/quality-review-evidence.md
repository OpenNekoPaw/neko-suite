# Quality Review Evidence

Date: 2026-07-13

## Scope and Risk

- Review method: `.codex/skills/neko-quality-review` with the Agent Evaluation
  evidence requirements from `.codex/skills/neko-agent-evaluation`.
- Risk: L3 because the change modifies AI workflow evaluation, TUI debug facts,
  Prompt/Skill identity evidence, external Judges, report redaction, and trusted
  provider-backed automation.
- L4 exposure: the platform is intended to gate core Agent and creative
  workflows, but no current-source real v2 case passed. It therefore cannot yet
  support an L4 rollout/readiness claim. Release and Market publication remain
  outside this change.

## Architecture Review

- Responsibility: Neko Agent remains the system under test; TUI/session/input
  queue/runtime facts stay runtime-owned, while authoring, suites, assertions,
  Judges, comparisons, and reports stay under `scripts/agent-eval`.
- Dependency: Evaluation scripts use Node and local platform modules only; they
  do not import target Agent, Skill, media, Canvas, or provider business
  implementations. No `neko eval` or second `AgentSession` assembly exists.
- Interface: strict v2 discriminated contracts fail on unknown versions,
  fields, evaluators, paths, references, or ineffective configuration before a
  behavior run can appear successful.
- Extension: indexed Skill and Agent-runtime suites share discovery, fixtures,
  runners, hard gates, artifact checks, Judges, and reports. New owners extend
  indexes and coverage rather than copy orchestration.
- Testing: key-free tests cover schemas, selection, runner/controller cleanup,
  typed facts, artifact containment, Judge projection, reports, comparison, CI
  policy, and all-suite dry-run. Real current-source acceptance remains blocked.

## Review Finding Resolved

The first review found that runtime facts and failure attribution were redacted,
but hard-gate messages and residual-risk diagnostics entered result/summary
documents directly. Those fields now use the same redaction pipeline, including
absolute user paths, bearer values, and credential-like assignments. An
adversarial report-writer test proves the values do not reach result, summary,
or quality output. The local report retention wording was also corrected:
developers own 14-day local cleanup; trusted CI enforces 14-day artifact
retention.

No remaining in-scope blocking code finding was identified after this fix.

## Verification

Passed:

- `pnpm test:agent:eval`: 23 files, 166 tests; all 26 indexed suites and 37
  cases passed key-free dry-run validation.
- `node scripts/agent-eval/all-suite-dry-run.mjs`: 26 suites, 37 cases.
- Agent Prompt/Skill focused tests: 4 files, 97 tests.
- Skill prompt boundary test: 2 tests, including builtin TypeScript prompt
  extraction.
- CLI-TUI debug automation app-port, session-manager, and artifact projector
  focused tests passed.
- shared Skill/identity focused tests: 2 files, 52 tests.
- `pnpm --filter @neko/skills test`: 33 files, 307 tests.
- `openspec validate establish-agent-evaluation-platform --strict`.
- `git diff --check`.

Executed but blocked or failed by concurrent repository state:

- `pnpm --filter @neko/cli build`: failed before bundling because the concurrent
  local-metadata change statically imports `bun:sqlite` into the Node tsup build.
- CLI-TUI `useAgentSession.runtime-assembly.test.ts`: 9/10 passed; the remaining
  media background-task fixture expects a task id while the concurrent task
  control contract now requires `TaskRunScope`, so `waitForTask` was not called.
- `pnpm check:agent-boundaries`: failed on two expired compatibility exceptions
  and one existing `cachePath` test residual.
- `pnpm check:legacy-debt`: failed with 85 blocking migrate-now/needs-review
  occurrences across the dirty repository.
- `pnpm check:unused`: Knip failed because the concurrent Bun SQLite test file is
  configured as a directory.
- `pnpm check:quality`: release-channel validation passed, then the same legacy
  debt ledger failure stopped the composite gate.

These failures were not converted to defaults, mocks, renewed exceptions, or
fallback success in this change.

## Real Evaluation Evidence

Current-source command:

```text
NEKO_DEBUG_COMMAND='./node_modules/.bin/tsx packages/neko-agent/packages/cli-tui/src/cli.tsx' node scripts/agent-eval/protocol-smoke.mjs --suite agent-runtime.single-message-tui --case canonical-answer --run-id run-m5-final-source
```

- Outcome: `infrastructure-fail`, exit code 2.
- Blocker: `neko-assets/agent-headless` does not provide the named
  `createNekoAssetsHeadlessCapabilityProvider` export under the current Node/tsx
  ESM/CJS boundary.
- TUI session/model call: not started.
- Model identity: `unavailable/unavailable`.
- Usage/cost: 0 input tokens, 0 output tokens, cost unavailable.
- Judge/baseline: skipped.
- Raw report:
  `reports/agent-eval/agent-runtime.single-message-tui/canonical-answer/run-m5-final-source/`.
- Redaction audit: no machine-specific user path or test credential marker was
  found in the report bundle.

Earlier milestone evidence remains relevant but is not current-source
acceptance:

- M1 bundled pilot used `nekoapi-chat/gpt-5.5` and returned `case-fail` because
  conversation-index JSON EOF diagnostics failed the runtime-error gate.
- M2 stale-binary Skill/artifact pilot used `nekoapi-chat/gpt-5.5`, created the
  expected file, then returned `configuration-invalid` because current typed
  facts were unavailable; current source hit the same module boundary.
- M3 bundled queue/cancellation runs used `nekoapi-chat/gpt-5.5` and produced
  partial control evidence, but returned configuration-invalid; current source
  again failed before session creation. The cancellation provider also returned
  HTTP 524.
- Token and cost completeness was unavailable for those earlier real attempts.
  None is recorded as pass.

## Blocked and Unexecuted Coverage

- All 37 v2 cases have strict key-free discovery/dry-run evidence.
- No current-source provider-backed v2 case has passed because the shared TUI
  process cannot start past the `neko-assets/agent-headless` module boundary.
- The trusted focused and repeated nightly matrices were not executed locally.
- Judge-backed subjective quality, approved baseline comparison, cost
  aggregation, healthy-stream cancellation, and current-source Skill/artifact
  identity remain unverified in real runs.
- The current CLI build has an additional `bun:sqlite` bundling blocker from a
  concurrent change; it does not replace or explain away the current-source
  module-boundary report.

## Remaining Rollout Risk

- Key-free green proves platform contracts and fake-green rejection, not model
  behavior or output quality.
- The universal TUI startup blocker prevents validating effective configuration,
  Host Skill identity/fingerprint, no-fallback, artifacts, multi-turn control,
  Judge quality, and repeated-sample stability against current source.
- The inherited developer runner still launches configurable debug commands
  through a shell and emits Node `DEP0190`; suite fixtures are contained and the
  command source is trusted, but a later tooling change should use an executable
  plus structured argument contract.
- Rollout should remain blocked from claiming real Agent readiness until at
  least one current-source canonical case and one failure/workflow case pass,
  followed by the relevant trusted focused matrix. Market/release decisions are
  explicitly deferred to their owning process.
