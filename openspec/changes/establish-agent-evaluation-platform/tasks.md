## 1. Existing Surface Audit and Contract Freeze

- [x] 1.1 Inventory current v1 manifests, supported and rejected case kinds, executable and metadata-only assertions/Judges, setup/post-checks, reports, fixtures, CLI/debug controls, facts consumers and real provider blockers.
- [x] 1.2 Map every existing scenario to a Skill or Agent-runtime owner and record stale, duplicate, unsupported, missing negative/artifact/regression/holdout coverage.
- [x] 1.3 Define strict schemas for authoring decisions, coverage deltas, suite/scenario v2, Host-owned Skill identity/fingerprint, runtime/model profiles, fixtures, assertions, artifact checks, rubric, budgets, reports, evidence, baselines and comparison results.
- [x] 1.4 Define redaction/retention allowlists for prompts, histories, provider config, logs, local paths, artifact summaries, raw reports and committed baselines.
- [x] 1.5 Add key-free schema tests rejecting unknown versions/fields/kinds, unsupported evaluators, unsafe paths, missing evidence contracts and invalid `reuse/update/create/excluded` decisions before TUI spawn.

## 2. M1 Authoring, Single-Case TUI Runner, and Minimal Report

- [x] 2.1 Refactor `scripts/agent-eval` into one shared runner/schema/suite/fixture/report module structure without changing the canonical debug automation entry.
- [x] 2.2 Implement change-to-suite mapping and authoring decision validation for known Prompt, Skill, Capability/Tool, Provider/Model, AgentSession, task/recovery, TUI facts and evaluation-platform paths.
- [x] 2.3 Implement v2 suite discovery by target, case group and case id, with strict owner/hash/fixture/runtime/model/report metadata.
- [x] 2.4 Implement one canonical single-message TUI driver using create, input queue submission, wait-for-idle, facts and dispose, with deterministic cleanup on pass/fail/timeout.
- [x] 2.5 Implement minimal runtime-error, fully-idle, final-answer and canonical-turn hard assertions plus pass/case-fail/infrastructure-fail/configuration-invalid classification.
- [x] 2.6 Generate versioned `result.json`, `evidence.json`, `artifact-manifest.json` and `quality-report.md` with gitignored raw output and sanitized summary support.
- [x] 2.7 Migrate one Agent-runtime scenario to v2 and add positive, negative and unsupported-field pilots proving v1/metadata cannot silently pass.
- [x] 2.8 Run focused harness tests and a real provider-backed TUI pilot, or record the exact credential/network/model blocker and residual risk.

## 3. M2 Typed Configuration, Skill, Tool, Task, and Artifact Evidence

- [x] 3.1 Replace untyped Skill activation facts with shared projections for portable name, Host source/provenance/root/location, Host-computed package fingerprint, slot, owner, trigger source, lifecycle status, injected fragment ids/hashes and tool policy ids.
- [x] 3.2 Add canonical session-scoped runtime/model profile input validation and effective configuration identity/digest projection without adding Evaluation concepts to TUI runtime.
- [x] 3.3 Extend Tool/task/continuation facts with stable identities, statuses, provider/model where owned, result observation and typed diagnostics.
- [x] 3.4 Add artifact facts for files, ResourceRefs, generated assets/project revisions, digest, provenance, delivery and owning validator status without durable cache/runtime identities.
- [x] 3.5 Add usage/timing/retry facts and dropped counts for every bounded evidence collection; make dependent assertions fail on incomplete evidence.
- [x] 3.6 Add prompt composition evidence limited to fragment identity/source/order/version/hash and adversarial tests proving hidden content and secrets are not projected.
- [x] 3.7 Implement deterministic Skill trigger/injection, Tool call, actual provider/model/profile, task terminal, artifact and no-fallback assertions from typed facts.
- [x] 3.8 Restrict post-checks to contained fixtures, stable refs, real files and audited public validators/CLIs; test traversal, symlink, secret and internal-business-import rejection.
- [x] 3.9 Migrate one Skill + artifact suite pilot and prove a correct-looking final answer fails when Skill, model, task, artifact or no-fallback evidence is wrong.

## 4. M3 Multi-Turn and Runtime Workflow Controller

- [x] 4.1 Extend the external controller for sequential turns, queue-during-run, closed-loop feedback, iterative tasks, resume, cancellation and recovery while routing every input through TUI queue operations.
- [x] 4.2 Implement process assertions for turn/timeline/Tool/task/continuation ordering, queue snapshots, cancellation, recovery, retries and terminal idle concerns.
- [x] 4.3 Implement structured output assertions for JSON/schema, tables, required/forbidden fields, references, locale and deterministic formats.
- [x] 4.4 Add key-free protocol/controller tests for every supported case kind, invalid state, timeout, cleanup, incomplete evidence and no legacy/default fallback.
- [x] 4.5 Migrate queue, continuation, cancellation, resume, model binding, stream delivery and Markdown scenarios into `suites/agent-runtime/`.
- [x] 4.6 Run focused real TUI cases for at least one multi-turn workflow and one cancellation/failure workflow, recording path-level facts and blockers.

## 5. M4 Judge, Repeated Samples, Baselines, and Comparison

- [x] 5.1 Implement external Judge adapters through configured provider APIs without importing target Agent/provider internals or storing credentials in manifests.
- [x] 5.2 Build allowlisted Judge evidence projections from user intent, public target contract, assistant output, approved artifact summaries, domain QualityEvidence and hard-gate results.
- [x] 5.3 Add Judge redaction/adversarial tests excluding hidden prompts, secrets, raw logs, unauthorized files, candidate labels and repository diffs.
- [x] 5.4 Implement domain-referenced rubric scoring with evidence refs and uncertainty, while enforcing hard-gate precedence.
- [x] 5.5 Implement repeated samples retaining every run, pass rate, score distribution, variance, latency, token/cost and Tool/retry metrics without best-run selection.
- [x] 5.6 Implement sanitized approved baselines and comparability checks for target identity/fingerprint, repository revision, fixture, runtime/model profile, sampling/budget and validator/Judge policy without Market package/version state.
- [x] 5.7 Implement generic randomized evidence comparison and `judge.json`/`baseline-diff.json`, returning non-comparable when policies materially differ.
- [x] 5.8 Implement evidence-linked failure attribution separating observed failures, suspected owner, confidence, missing evidence and handoff recommendation.
- [x] 5.9 Add parser/report tests for Judge unavailable/malformed, hard-gate conflict, redaction, uncertainty, non-comparable and failure classification.

## 6. M5 Suite Migration and CI Lanes

- [x] 6.1 Create validated `suites/skills/` and `suites/agent-runtime/` indexes with owner metadata and no duplicated runner/assertion code.
- [x] 6.2 Migrate portable Skill creation, Storyboard, image/video, media production/quality, perception routing and creative workflow cases with canonical, negative, artifact, quality, regression and holdout coverage as applicable.
- [x] 6.3 Add explicit coverage or documented deterministic exclusions for remaining builtin Skills, Prompt roles and Agent-runtime capabilities.
- [x] 6.4 Validate all v2 suites, then remove flat v1 manifests, metadata-only fields, v1 execution and migration converter by its expiry condition.
- [x] 6.5 Add default key-free schema/runner/assertion/Judge-parser/all-suite dry-run CI without provider secrets.
- [x] 6.6 Add trusted focused selection for affected suites and nightly Debug Functional repeated matrices with sanitized artifacts and infrastructure failures distinct from behavior regressions.
- [x] 6.7 Prove fork PRs cannot access secrets and missing credentials/network/quota/model/fixture return explicit infrastructure/blocked evidence rather than mocks or fallback.

## 7. Documentation, Boundary Cleanup, and Quality Review

- [x] 7.1 Update Agent architecture, contribution guides, quality ADR, scripts README/test-case guidance and CI/redaction policy for the platform boundary and vertical workflow.
- [x] 7.2 Update `.codex/skills/neko-agent-evaluation` with authoring decisions, suite selection, evidence, report interpretation and residual risk while moving concrete commands/protocol/schema tutorials to runner documentation.
- [x] 7.3 Add Skill-content boundary tests preventing runtime tool/protocol/authoring instructions from returning to builtin/custom/Codex evaluation methodology where applicable.
- [x] 7.4 Run focused TUI/debug tests, `pnpm test:agent:eval`, all-suite dry-run, affected package tests/builds, `pnpm check:agent-boundaries`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check:quality` and strict OpenSpec validation.
- [x] 7.5 Run `neko-quality-review`, record L3/L4 risks, real Evaluation commands/report locations/model identities/costs, blocked suites, unexecuted cases and remaining rollout risk.
- [x] 7.6 Declare every directly executed Evaluation CLI and public validator as an explicit unused-code-analysis entry, and prove the platform adds no unused file or dependency finding.
- [x] 7.7 Route debug automation submissions through the same TUI App user-input dispatcher as interactive command and Skill triggers, with poison tests proving `$skill` cannot bypass lifecycle activation.
