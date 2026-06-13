## Context

Two ADRs define the current governance problem:

- `adr-agent-host-boundary-review.md` identifies live business logic in Agent Extension and Webview layers. The highest-risk files are `characterDialogueController.ts`, `characterEvidenceLoader.ts`, `agentProjectSearchAdapters.ts`, and `entity-memory-contribution-inference.ts`.
- `adr-code-debt-cleanup-strategy.md` shows that the repository does not have broad dead-code rot. The real cleanup issues are migration shims, legacy bridges, static-analysis false positives, and active domain logic placed in the wrong layer.

The existing architecture target remains:

```text
Webview
  UI, local view state, typed user intent, projection
        |
        v
Extension Host
  VSCode commands, postMessage, fs/URI/workspace adapters, lifecycle
        |
        v
Agent/runtime + domain packages
  business orchestration, policies, evidence/search/entity rules
        |
        v
Platform/search/entity/provider packages
  concrete services behind host-agnostic contracts
```

Current constraints:

- Webview cannot import VSCode, Node.js, `@neko/agent`, `@neko/platform`, or `@neko/ai-sdk`.
- Extension can use VSCode APIs but should not own reusable Agent/domain strategies.
- Runtime/domain services must compile and test without VSCode or React.
- `projectSearch` shim cleanup is a real prerequisite for clean evidence/search refactoring because `characterEvidenceLoader.ts` still imports the shim command constant.
- Agent tool registration Phase 3 is a guardrail/diagnostic track and can run in parallel with boundary migration.

五层分析:

| 层 | 设计判断 |
|----|----------|
| 职责 | Extension/Webview keep host/UI duties; runtime/search/entity own policies and durable contribution inference. |
| 依赖 | Runtime contracts receive injected host readers/adapters; no VSCode/React dependency flows into runtime. |
| 接口 | Add narrow ports for character dialogue, entity contribution inference, evidence strategy, and search aggregation. |
| 扩展 | Future character/evidence/search features extend runtime/domain services, not host controllers. |
| 测试 | Add pure runtime tests first, then adapter characterization tests to preserve current behavior while moving ownership. |

## Goals / Non-Goals

**Goals:**

- Delete the remaining Agent `projectSearch` compatibility shim after moving production imports and tests to `@neko/search/host-vscode`.
- Split `characterDialogueController.ts` into a VSCode/Webview adapter plus runtime-owned character dialogue orchestration.
- Move Webview `EntityMemoryContribution` inference into a host-agnostic Agent/entity service.
- Move evidence locator derivation, freshness, relevance scoring, trimming, and story-scene locator derivation into runtime evidence strategy.
- Move project search candidate extraction, dedupe, and freshness/status aggregation into `@neko/search` or `@neko/entity`.
- Preserve user-visible behavior and message compatibility during migration.
- Add cleanup governance for LCD entries, legacy bridges, fallback classification, and static-analysis false positives.
- Add guardrails that prevent newly migrated domain tools from being registered through legacy centralized paths.

**Non-Goals:**

- Rewriting the whole Agent Extension host in one PR.
- Removing the AI SDK legacy bridge before fal.ai, DashScope, and Kling have native or configured provider paths with tests.
- Deleting broad `fallback` logic that is still runtime resilience, compatibility reading, or provider degradation.
- Removing canonical compatibility fields such as message `toolCalls?` / `thinking?`, proto legacy fields, or file-format migrators.
- Changing character dialogue UX, entity review UX, project search command names, or public Webview protocol names unless a compatibility wrapper is kept.
- Solving unrelated knip candidates in Dashboard, Canvas, Sketch, Story, Tools, Puppet, or Engine beyond baseline/ignore accuracy needed by this change.

## Decisions

### Decision 1: Migrate by ports before deleting host logic

Define host-agnostic ports and services first, keep the Extension/Webview call sites stable, then move implementation rules behind the ports. Each migrated slice should have runtime tests before host adapter simplification.

Alternative considered: directly split large files by moving private helper functions into new files under Extension.

Rejected because that would reduce file size without fixing the ownership boundary. The same business rules would remain host-owned and still block CLI/TUI/test reuse.

### Decision 2: Treat projectSearch shim removal as Phase 1 prerequisite

The first implementation batch should replace the final production shim import in `characterEvidenceLoader.ts` with the `@neko/search/host-vscode` command contract, migrate remaining tests, and delete `packages/neko-agent/packages/extension/src/services/projectSearch/*`.

Alternative considered: migrate character evidence first and leave the shim as a temporary import.

Rejected because the evidence refactor would inherit the stale import path and make the later deletion harder to validate.

### Decision 3: Use runtime services for character dialogue, not a larger controller

Introduce a `CharacterDialogueRuntimeService` or equivalent service with narrow collaborators:

- profile/profile-enrichment port,
- transcript evaluation port,
- fallback report builder,
- suggestion policy/apply planner,
- headless probe orchestration port,
- evidence bundle requester,
- save/apply effect ports supplied by the host.

`characterDialogueController.ts` should retain tab state, `postMessage`, `QuickPick`, command registration, VSCode file access adapters, and `Disposable` lifecycle.

Alternative considered: make `createSkillPrimitivePorts()` the long-term abstraction.

Rejected because it currently exposes a list of runtime responsibilities from the Extension side. It can be a migration bridge, but the durable owner should be runtime/domain code.

### Decision 4: Entity memory contribution inference becomes domain/runtime logic

Move Markdown table parsing, entity candidate inference, observation dimension inference, confidence scoring, diagnostics, and `EntityMemoryContribution` construction into `@neko/agent` first. The immediate owner is Agent artifact/runtime projection because the source input is Agent-authored character-analysis Markdown and the output is a reviewable Agent contribution envelope. `@neko/entity` remains the owner of validation, review automation, persistence, and accepted entity memory writes.

Webview presenters should receive a contribution preview/projection and send user confirmation or rejection intent.

Alternative considered: keep inference in Webview because it is triggered from a presentation flow.

Rejected because the output is durable domain evidence that can affect later Agent cognition. That makes it business infrastructure, not display fallback.

### Decision 5: Evidence strategy is host-agnostic; evidence reads remain host-adapted

`characterEvidenceLoader.ts` should keep injected VSCode command readers, file readers, Story API adapters, and Extension discovery. Runtime evidence strategy should own locator collection, story-scene locator derivation, freshness rules, relevance scoring, dedupe, budget trimming, and omission metadata.

Alternative considered: move all evidence loading including file reads into runtime.

Rejected because VSCode workspace files, extension APIs, and command calls are host integration. Runtime should receive typed reader ports, not direct host authority.

### Decision 6: Search aggregation belongs to search/entity packages

Move creative entity candidate extraction, `@character` script-role parsing, dedupe, freshness priority, and multi-source status aggregation out of Agent Extension adapters. `@neko/search` should own search fan-out and result status; `@neko/entity` should own entity-specific projections and candidate semantics.

Implementation note: freshness-aware creative entity dedupe and partition status/freshness aggregation live in `@neko/search/core`. Dashboard creative entity row projection, script-role candidate extraction, and context-script entity candidate projection live in `@neko/entity/projections`. Agent Extension only supplies VSCode command reads, file reads, Story API access, URI conversion, and host DTO mapping.

Alternative considered: keep Agent-specific aggregation for mention search.

Rejected because project search is shared infrastructure. Agent can map `ProjectSearchItem` records to mention DTOs, but should not own cross-source aggregation policy.

### Decision 7: Cleanup governance tracks misplaced domain logic separately

Add `agent-code-debt-cleanup-governance` as a capability so cleanup work can distinguish:

- confirmed dead code,
- static false positives,
- canonical compatibility,
- migration adapters,
- stray legacy surfaces,
- misplaced domain logic,
- runtime fallback/resilience.

Alternative considered: model misplaced domain logic as deprecated code.

Rejected because these files are active and behaviorally correct. The remediation is migration to the right owner, not deletion by unused-code cleanup.

### Decision 8: AI SDK legacy bridge is sunset by provider, not globally

Keep the bridge while fal.ai, DashScope, and Kling still route through legacy adapters. Each provider gets explicit migration conditions and tests proving `resolveProvider()` no longer enters `createLegacyBridgeProvider()` for the supported task family.

Alternative considered: delete all legacy bridge wrappers once native AI SDK support exists for any one provider.

Rejected because media providers do not reach native parity at the same time, and bridge removal must not break image/video/speech task execution.

### Decision 9: CapabilityProvider guardrail runs independently of boundary migration

Add duplicate provider/tool diagnostics and a no-new-domain-tool-on-legacy-path rule, but do not make Phase 3 block character/evidence/entity migration. Boundary migration targets do not contain tool registration code.

Alternative considered: enforce strict serial order from boundary migration to tool registration cleanup.

Rejected because the code evidence does not show a blocking dependency. The useful coupling is a guardrail: migrated services must not introduce new legacy registrations.

Implementation note: `CapabilityRegistryRuntime` now records structured diagnostics for duplicate provider ids, duplicate canonical tool names, conflicting normalized short names, and legacy/provider path conflicts. `toolBootstrap.ts` exports lifecycle metadata for the remaining centralized agent-owned meta-tools / compatibility bridges, and `pnpm check:agent-boundaries` rejects new undocumented centralized tools.

### Decision 10: LCD validation runs through agent boundary checks

`docs/architecture/agent-code-debt-lcd-register.json` is the executable LCD register source for this change. `pnpm check:agent-boundaries` validates LCD categories, owner, replacement, remove-after condition, tests, provider sunset rows, and referenced test file paths. This makes the stable CI/review entry `pnpm check:agent-boundaries`; `pnpm check:unused` remains the dependency/dead-code scanner, not the lifecycle metadata authority.

## Risks / Trade-offs

- Runtime service seams may initially duplicate some controller helper behavior → Keep characterization tests around existing Extension/Webview behavior until runtime tests cover the migrated rule.
- Moving contribution inference could change confidence or diagnostics subtly → Add golden tests using current Markdown table examples and compare emitted `EntityMemoryContribution` shape.
- Search/evidence migration may expose hidden reliance on VSCode command payload quirks → Define typed adapter DTOs and keep Extension adapter tests with fake command responses.
- Deleting projectSearch shims could break stale internal imports → Run `rg` import checks, package tests, and `pnpm check:unused` after deletion.
- AI SDK legacy bridge sunset could become open-ended → Track provider rows in LCD-009 with resolver tests and explicit migration triggers.
- Static-analysis cleanup can become noisy across unrelated packages → Limit this change to Agent-boundary-relevant baselines and precise knip false-positive entries.
- Large-file refactoring may conflict with active user changes → Implement in small batches and avoid rewriting unrelated sections in dirty files.

## Migration Plan

1. Stabilize cleanup baseline:
   - migrate the final production `projectSearch` shim import,
   - delete Agent `projectSearch` shim files and stale tests,
   - update knip false-positive handling only where verified.
2. Add runtime/domain contracts and tests:
   - character dialogue orchestration,
   - entity memory contribution inference,
   - evidence strategy,
   - search/entity aggregation helpers.
3. Wire Extension/Webview adapters to the new services while preserving existing messages and commands.
4. Remove migrated host-side helper logic from Extension/Webview files once tests pass.
5. Add guardrails:
   - forbidden Webview durable contribution inference,
   - no new Agent-local projectSearch shim imports,
   - duplicate capability/provider diagnostics,
   - LCD metadata validation for legacy/deprecated surfaces.
6. Update ADR/LCD docs and run targeted validation.

Rollback strategy:

- Each slice keeps the host adapter API stable, so a failed runtime migration can be reverted by restoring the adapter call to the previous helper while keeping contract tests as diagnostics.
- Shim deletion should only happen after `rg` confirms no imports; rollback is restoring the shim files and import if an overlooked consumer appears.
- AI SDK bridge remains present during this change, so provider execution rollback is not required.

## Open Questions

- Should the entity memory contribution inference service live in `@neko/agent` first, or should the pure inference core move directly to `@neko/entity` with Agent as orchestration caller?
- How much of `characterDialogueController.ts` should be migrated in the first batch: profile/evaluation only, or headless probe and suggestion policy as well?
