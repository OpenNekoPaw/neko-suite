## Evaluation Scope

- Change: `scope-agent-perception-media-projection`
- Decision: update `agent-runtime.perception-routing`
- Canonical path: TUI input queue -> AgentSession -> current-turn media read/perception -> provider-aware projection -> later text-only turn
- Forbidden fallback: historical packet replay, historical perception-card media reload, prompt-only inference, or direct turn injection

## Cases

- Existing owner: `agent-runtime.perception-routing` owns native versus external perception routing.
- Required delta: one multi-turn regression/boundary case proving the originating turn may project media, a text-only follow-up projects zero historical media, and explicit reinspection projects only the newly selected resource.
- Deterministic evidence: Platform tests poison the historical loader, assert zero calls on later ordinary and internal-continuation turns, remove historical packet JSON from provider messages, and assert one loader call for the explicitly reinspected current resource.
- Missing observability: current TUI debug facts expose model, Tool, task, process, error, and idle state but do not expose bounded provider-projected media counts or media-loader asset identities. The required real case is blocked; final-answer text cannot substitute for this path evidence.

## Verification

- Focused Platform projection: `pnpm --filter @neko/platform exec vitest --run src/service/__tests__/shared-service-adapter.test.ts src/service/__tests__/service.test.ts` passed 53 tests in 2 files.
- Evaluation selector: `pnpm exec vitest --run scripts/agent-eval/authoring/change-selector.test.mjs` passed 4 tests; the production projection path now maps to `agent-runtime.perception-routing`.
- Authoring contract: `evaluation-decision.json` passed the strict `validateAuthoringDecision` schema validator.
- Key-free authoring and harness validation: `pnpm test:agent:eval` passed 263 tests in 39 files; strict all-suite dry-run passed 26 suites and 38 cases.
- Formatting and patch integrity: scoped Prettier check and `git diff --check` passed.
- Typecheck: attempted `pnpm exec tsc -p packages/neko-agent/packages/platform/tsconfig.json --noEmit`; blocked by pre-existing errors outside this change in Agent command/perception/session files, NewAPI video, Platform config/market/media tests, and the Anthropic adapter. No changed file from this OpenSpec appeared in the diagnostics.
- Legacy/unused gates: `pnpm check:legacy-debt` and `pnpm check:unused` both ran and failed on existing repository-wide debt/unused findings outside the scoped files. This change adds no production legacy/fallback term, unused export, dependency, or file.
- Focused dry-run: blocked until the required neutral runtime facts and supported hard assertion exist.
- Real TUI case: blocked by the same missing observability; provider credentials alone cannot close this evidence gap.

## Interpretation

- Confirmed implementation defect: provider-aware projection treated all historical packets and perception cards as current, causing unrelated follow-up turns to reload media.
- Confirmed owner: Platform provider message projection. Model routing, perception output, content access, and prompt content are not the defect owners.
- Real behavior attribution remains unverified until the canonical TUI evidence surface can distinguish current-turn media projection from historical replay.

## Residual Risk

- Deterministic tests prove the Platform boundary directly but do not yet prove the complete TUI session emits the expected provider payload over multiple real turns.
- The existing provider model-call recorder contains redacted projected message snapshots, but Evaluation does not currently ingest it as a bounded canonical runtime fact.
- The repository-wide typecheck, legacy-debt, and unused gates are currently red for unrelated working-tree/baseline findings, so only focused compile-adjacent tests and diff validation are green for this change.
