## Context

`@neko/agent` currently has a real architecture boundary problem rather than a naming-only cleanup. The `runtime/` root contains:

- long-lived runtime owners: `agent-runtime-manager`, `agent-runtime-pool`, `agent-session-factory`, `agent-runtime-session-controller`;
- runner contracts and execution wrappers: `agent-runner-port`, `agent-session-runner`;
- per-message turn orchestration: `agent-turn-runtime`, `agent-turn-assembly`, `message-runtime`;
- capability registry/binding/refresh code: `capability-registry-runtime`, `capability-runtime-bindings`, `capability-runtime-refresh`, `agent-capability-*`;
- stream state helpers: `agent-event-stream-runtime`, `agent-stream-*`;
- code with clearer existing owners: `artifact-service`, `node-artifact-store`, `attachment-projection`, `message-resource-projector`, `context-webview-presenter`, `conversation-webview-presenter`.

The current `runtime/index.ts` layering guide is useful, but it describes a narrower runtime than the directory now contains. The practical result is that unrelated concepts can be justified as "runtime" even when better owner directories already exist.

This design keeps the change proportional to a local VSCode Extension Host plus local Engine product. It does not add a generic governance/control plane, a cloud policy layer, or a broad PromptLayer manager.

## Goals / Non-Goals

**Goals:**

- Define a precise placement contract for `packages/neko-agent/packages/agent/src/runtime`.
- Prefer existing owner directories when they already express the responsibility.
- Add small runtime subdirectories only where the runtime concept has no existing owner and the root is overloaded.
- Clarify the differences between runner, turn, ReAct, session, context, memory, and capability.
- Keep skill lifecycle in `skill/`, prompt composition in `prompt/`, permission policy in `permission/`, and domain capability implementations in domain packages or `neko-skill`.
- Add fail-visible architecture tests that prevent runtime from becoming a generic presenter/projector/service/store/domain bucket.

**Non-Goals:**

- Do not change Agent execution behavior.
- Do not move cross-package capability provider contracts out of `@neko/shared`.
- Do not move skill lifecycle back into `runtime/`.
- Do not create a new governance layer for lifecycle, permission, tool policy, activation progress, or PromptLayer.
- Do not add compatibility shims beyond narrow transitional re-exports needed for local import migration.
- Do not touch Rust Engine, Protobuf, durable project formats, or Webview runtime behavior.

## Decisions

### Decision 1: Existing owner directories win before new directories

When a runtime-root file already has a clear owning package directory, move it there instead of creating a new top-level directory.

Recommended placement:

| Current runtime concern | Preferred owner | Rationale |
| --- | --- | --- |
| `context-webview-presenter`, `conversation-webview-presenter` | existing host/chat presenter area if available, otherwise `session/` or `commands/` only when they project those owner contracts | Presenters adapt runtime/session state for host messages; they are not runtime state owners. |
| `attachment-projection` | `input/` or message preparation area | It prepares message attachments and file/media references for a turn, not long-lived runtime state. |
| `message-resource-projector` | message preparation/content access owner | It is projection glue, not runtime lifecycle. |
| `artifact-service`, `node-artifact-store` | existing `artifact/` and/or `workspace/` owner directories | Artifact persistence, validation, and workspace fs concerns already have owner directories. |
| prompt modules and prompt file runtimes | `prompt/` | Prompt composition is a prompt contract, not runtime governance. |
| skill lifecycle/runtime/bootstrap | `skill/` | Skill lifecycle is already moved and should remain the source of truth for Skill runtime behavior. |
| permission/tool policy | `permission/` and `tools/` | Policy and tool trait evaluation are not Agent runtime ownership. |
| plan/task projectors | `plan/`, `task/` | These are domain projections over plan/task state. |

Rejected alternative: create many new top-level directories such as `presenters/`, `projectors/`, `stores/`, and `services/` immediately. That would be a taxonomy refactor without stronger ownership. New directories are only justified when no current owner exists.

### Decision 2: Runtime may gain small subdirectories for overloaded runtime subdomains

Keep `runtime/` as the host-neutral Agent runtime boundary, but stop using its root as the catch-all. Candidate subdirectories:

- `runtime/session/`: session factory, runtime session controller, session config projection, host bindings.
- `runtime/runner/`: runner port, session runner, runner event queue/confirmation contracts.
- `runtime/turn/`: turn execution, turn assembly, message runtime, turn context, multimodal turn packets.
- `runtime/capability/`: Agent-side consumption of capability providers: registry runtime, binding store, refresh runtime, injection/lifecycle bridge code that consumes shared provider contracts.
- `runtime/stream/`: event stream runtime, background task, stream state, stream observers.

These subdirectories should remain host-neutral and Agent-owned. They are not places for VSCode presenters, React code, domain concrete adapters, or storage services with existing owners.

Rejected alternative: leave all files in the runtime root and rely on comments. The root already has comments and still drifted; tests and smaller owner folders are needed.

### Decision 3: Runner, turn, and ReAct are separate layers

`runner`, `turn`, and `ReAct` are related but not interchangeable:

- **Runner** is an execution port around one configured `AgentSession`. It exposes `execute`, `cancel`, confirmation, pending-message queue, history load, active Skill projection, and events. Current examples are `AgentRunnerPort`, `AgentSessionRunner`, and the Extension `AgentRunnerRuntimeAdapter`.
- **Turn** is one user-message dispatch through provider/model selection, system prompt choice, attachment/context packet assembly, history hydration, per-turn runner configuration, stream processing, and assistant message persistence. Current examples are `runAgentTurnRuntime`, `executeAgentTurn`, `message-runtime`, and `agent-turn-assembly`.
- **ReAct** is the executor's internal think -> act -> observe loop and hook surface. Current example is `createReActLoopRunner` in `executor/`, which plugs stage activation planning into `AgentExecutor` without owning session lifecycle or host runtime.

Therefore, `ReAct` stays in `executor/`; `turn` belongs in a runtime turn subdomain or existing message preparation owner; `runner` belongs in a runner subdomain because it is the port between host manager and session.

Rejected alternative: move ReAct into runtime because it runs at runtime. That would blur executor semantics with host/session orchestration and make the already overloaded `runtime` directory worse.

### Decision 4: Session, context, and memory remain separate concepts

`session`, `context`, and `memory` answer different questions:

- **Session** owns one configured Agent conversation execution object and its live collaborators: executor, prompt composer/modules, event bus, journal, artifact facade, validation bridge, Skill projection, stage tracking, and mutable conversation execution state. `AgentSession` is the owner.
- **Context** owns prompt/window budgeting and conversation compression mechanics: layered context items, token budget, summarization, auto compact, creative version log, and context persistence. Context is the model-input working set, not durable fact memory.
- **Memory** owns persisted and recalled facts across sessions: project memory file, memory recall, and scratch/shared memory. Memory can feed context or prompt modules, but it is not the same as the current context window.

`session/working-memory.ts` is a naming tension: it projects persisted journal events back into chat history, so it is session resume/history projection rather than project memory. The implementation can keep the name if moving it would be too noisy, but the design contract should document that it is not `memory/` ownership.

Rejected alternative: merge context and memory under runtime because both affect prompts. That would hide the difference between transient model input, durable project facts, and session execution state.

### Decision 5: Capability is cross-package, but Agent runtime only consumes Agent-facing capabilities

Capability has non-Agent uses in the monorepo, including market server capabilities, model control capabilities, Engine/device capabilities, asset federation capabilities, effect capabilities, and domain UI availability. The Agent-specific contract is `AgentCapabilityProvider` in `@neko/shared`, implemented by domain packages such as Cut, Model, Audio, Engine, Assets, and Agent extension-owned providers.

Ownership rule:

- `@neko/shared` owns the cross-package Agent capability protocol.
- Domain packages own concrete provider implementations and domain semantics.
- `neko-agent/packages/extension` owns VSCode discovery and registration command wiring.
- `neko-agent/packages/agent/src/runtime/capability` may own host-neutral registry, binding, refresh, and injection coordination that consumes providers and projects them into Agent session registries.

Rejected alternative: create a generic `capability/` directory under Agent and move all capability concepts there. That would imply Agent owns non-Agent capability types and would invite cross-domain coupling.

### Decision 6: Runtime planes are bootstrap projection, not governance

`AgentRuntimeConfig` currently groups `creationGuidance`, `artifactStore`, `capabilityRuntime`, and `validationLoop`. Keep this as a bootstrap projection convenience for session creation, but do not expand it into a fixed control layer.

Rules:

- Lifecycle governance stays with the specific owner: Skill in `skill/`, IDC/creation guidance in creation/session workflow code, permission in `permission/`, prompt modules in `prompt/`, validation in validation/session bridge.
- The bootstrap projection may thread stable ports into `AgentSessionConfig`.
- New policy decisions must be owned by the domain module that enforces them, not by a generic runtime plane.

Rejected alternative: centralize lifecycle, permission, activation progress, PromptLayer, and tool policy under `runtime/types.ts`. That is over-designed for the local product boundary and creates an abstract control layer around code that already has concrete owners.

### Decision 7: Architecture tests enforce the placement contract

Implementation should add or extend boundary guards so drift is caught at review time:

- no `*-presenter.ts`, `*-projector.ts`, broad `*-service.ts`, or `*-store.ts` files in `runtime/` root unless explicitly allowlisted as transitional;
- no React, VSCode, Webview, or Extension imports from runtime collaborators;
- no concrete domain operation adapters in Agent runtime;
- no domain creative runtime ownership in Agent runtime;
- runtime subdirectories must match the allowed subdomain list or be documented in `runtime/README.md` / `runtime/index.ts`.

Rejected alternative: rely on code review discipline. The current directory drift is exactly the kind of architectural erosion that tests should make visible.

## Five-Layer Analysis

### Responsibility

- `runtime/` owns host-neutral Agent runtime lifecycle, per-turn coordination, runner ports, capability consumption, and stream state.
- Existing owner directories own their domain concerns: `session/`, `context/`, `memory/`, `artifact/`, `workspace/`, `prompt/`, `skill/`, `permission/`, `plan/`, `task/`, and `commands/`.
- Extension Host remains the VSCode adapter and does not implement Agent runtime collaborators.

### Dependency

- Runtime code must remain Layer 0/host-neutral TypeScript: no VSCode, React, DOM, Webview, or Extension imports.
- Cross-package capability contracts stay in `@neko/shared`; concrete domain providers stay in domain packages.
- Webview does not import Agent runtime.
- Extension may import Agent runtime as a host adapter, but runtime must not import Extension.

### Interface

- Keep public exports stable through the package `runtime/index.ts` during the first implementation slice.
- If files move into runtime subdirectories or existing owner directories, prefer explicit re-exports with removal tasks rather than broad compatibility barrels.
- Directory rules are expressed through docs plus architecture-boundary tests, not through a new runtime registry or config schema.

### Extension

- Future runtime-adjacent features should first answer:
  1. Does an existing owner directory already own this data or behavior?
  2. Is this host-neutral Agent runtime lifecycle/turn/runner/capability/stream code?
  3. Can a focused boundary test prevent the same ambiguity from returning?
- A new runtime subdirectory is allowed only when the concept is Agent-runtime-owned and repeated enough that the root would become ambiguous again.

### Testing

- Unit tests should continue to cover moved implementation behavior through existing test files or renamed equivalents.
- Architecture-boundary tests should enforce the directory contract.
- Import-path changes should be covered by package build/check commands.
- Because this is internal architecture cleanup with no Webview behavior change, VSCode Webview smoke is not required unless implementation touches Webview messages or UI.

### Proportionality

This design avoids a broad `PromptLayer`/governance/control-plane abstraction. It uses docs, narrow directory moves, transitional exports, and boundary tests because the real problem is ownership drift inside a local extension package, not distributed runtime policy.

### Fail-Visible Behavior

- New misplaced runtime files should fail architecture tests.
- Unknown runtime subdirectories should fail tests or require documentation updates.
- Removed/relocated imports should fail TypeScript/build checks rather than silently falling back through hidden aliases.
- Transitional re-exports must be visible in tasks and removed when callers are migrated.

## Risks / Trade-offs

- [Risk] Moving files causes noisy import churn. -> Mitigation: migrate in small owner-based slices and keep narrow transitional re-exports only where needed.
- [Risk] Boundary tests become too broad and block legitimate runtime files. -> Mitigation: use allowlists for documented exceptions and require a design update when adding a new runtime subdomain.
- [Risk] Existing `runtime/index.ts` public exports hide the new structure. -> Mitigation: keep the public barrel temporarily but document canonical file ownership and add removal tasks for transitional exports.
- [Risk] `capability` remains ambiguous because the monorepo has many capability types. -> Mitigation: name docs and tests around `AgentCapabilityProvider` consumption, not generic capability ownership.
- [Risk] The cleanup becomes a cosmetic file shuffle. -> Mitigation: each move must be tied to an owner rule and protected by a boundary test.

## Migration Plan

1. Add runtime boundary documentation to `runtime/index.ts` or a new `runtime/README.md`.
2. Add architecture-boundary tests for runtime root file categories and allowed subdirectories.
3. Create only the runtime subdirectories needed for the first migration slice.
4. Move obvious non-runtime files to existing owner directories first.
5. Move runner, turn, capability, and stream files into runtime subdirectories only where that reduces root ambiguity.
6. Update imports and package barrels.
7. Run focused Agent tests, architecture boundary tests, and package-level checks.

Rollback is straightforward because this change does not alter durable data or user behavior: restore file locations/imports for the affected slice and remove the added boundary checks.

## Open Questions

- Should `message-runtime` live under `runtime/turn/` or move to a dedicated message preparation owner outside runtime?
- Should `artifact-service` be split between `artifact/` and `workspace/`, or stay together under `artifact/` with injected workspace fs ops?
- Should `context-webview-presenter` and `conversation-webview-presenter` move into an existing host-message area in the Extension package instead of Agent package owners?
- Should `session/working-memory.ts` be renamed later to avoid confusion with durable project memory, or is documentation enough for now?
