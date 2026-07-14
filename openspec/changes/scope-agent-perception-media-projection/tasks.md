## 1. Contract and regression coverage

- [x] 1.1 Add red-capable Platform projection tests proving a later ordinary or internal-continuation turn does not reload historical packet/card media and retains compact evidence.
- [x] 1.2 Add current-turn and explicit-reinspection path tests proving only cards produced after the latest turn boundary can invoke the media loader.

## 2. Canonical provider projection

- [x] 2.1 Replace history-wide multimodal packet lookup with current-turn segment selection in the shared-service adapter.
- [x] 2.2 Replace history-wide perception-card collection with current-turn card selection while preserving deduplication and existing fail-visible current-turn diagnostics.
- [x] 2.3 Remove obsolete history-wide helpers and verify no parallel/fallback projection path can replay historical media.

## 3. Deterministic validation

- [x] 3.1 Run focused `@neko/platform` shared-service and service projection tests, including poisoned-loader no-replay assertions.
- [x] 3.2 Run affected Agent/Platform typecheck or build gates and `git diff --check`.
- [x] 3.3 Run relevant legacy-debt/unused validation or document why the broader repository gate is blocked.

## 4. Agent Evaluation

- [x] 4.1 Audit the Evaluation change-to-suite mapping, developer documentation, indexed suites, runtime facts, and runner tests; record a reuse/update/create decision and evidence contract.
- [ ] 4.2 Add or update the focused multi-turn media lifecycle Evaluation case and pass key-free schema/runner/index validation.
- [ ] 4.3 Run the focused real TUI case for no historical replay and explicit reinspection when credentials, model access, and fixture media are available; otherwise record the exact blocker and residual behavior risk.

## 5. Documentation and quality review

- [x] 5.1 Update Agent architecture documentation with turn-scoped native media and durable compact perception evidence rules.
- [x] 5.2 Run the Neko quality review, resolve blocking findings, and record validation commands plus residual risks in the change evidence.
