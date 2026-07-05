## Why

`packages/neko-agent/packages/agent/src/runtime` has become a semantic catch-all for long-lived agent state, per-turn orchestration, capability registry binding, host message presenters, artifact stores, and projection helpers. The ambiguity now makes it easy to place new PromptLayer, lifecycle, permission, tool-policy, or domain helper code in the wrong owner directory, especially after skill runtime ownership moved into `skill/` and domain capabilities moved into `neko-skill` and domain packages.

This change is needed before more Agent runtime work lands so the local VSCode + local Engine architecture keeps clear ownership without introducing a generic governance/control layer.

## What Changes

- Define the allowed meanings of Agent runtime code:
  - long-lived conversation/session runtime ownership;
  - host-neutral session bootstrap/projection;
  - per-turn orchestration that coordinates an already configured agent;
  - runner ports/adapters that execute one session and expose confirmation/cancel/queue events;
  - capability consumption/runtime binding for Agent-owned registries and dynamic provider contributions.
- Define what does not belong in `runtime/`:
  - Webview presenters and host message presenters;
  - resource projectors and attachment projection helpers;
  - workspace/artifact stores and persistence services with existing owner directories;
  - skill lifecycle internals, prompt composition modules, permission policy engines, and domain concrete operation adapters;
  - cross-package capability provider contracts that already belong in `@neko/shared`.
- Clarify directory placement rules:
  - prefer existing owner directories (`session/`, `context/`, `memory/`, `artifact/`, `workspace/`, `prompt/`, `skill/`, `permission/`, `plan/`, `task/`, `commands/`) when ownership already exists;
  - add small runtime subdirectories only for overloaded runtime subdomains that do not already have a clear owner, such as `runtime/session/`, `runtime/turn/`, `runtime/runner/`, `runtime/capability/`, and optionally `runtime/stream/`;
  - keep transitional re-exports only when needed for local import stability during migration, with removal tasks instead of long-lived compatibility shims.
- Document the semantic differences between runner, turn, ReAct, session, context, memory, and capability so future code uses the correct owner.
- Add or update architecture boundary tests to prevent new `*-presenter`, `*-projector`, concrete domain runtime, operation adapter, and broad service/store files from entering the runtime root.
- Non-goals:
  - no behavioral rewrite of Agent execution;
  - no movement of skill lifecycle back into `runtime/`;
  - no generic governance, control plane, or remote-scale policy layer;
  - no changes to Rust Engine, Protobuf, Webview UI behavior, durable project files, or external provider contracts.

## Capabilities

### New Capabilities
- `agent-runtime-directory-boundary`: Defines Agent runtime directory ownership, placement rules, semantic distinctions among runtime-adjacent concepts, and guard expectations that keep runtime from becoming a generic governance or domain helper bucket.

### Modified Capabilities
- None.

## Impact

- Affected package: `packages/neko-agent/packages/agent`.
- Likely affected files during implementation:
  - `packages/neko-agent/packages/agent/src/runtime/index.ts`;
  - `packages/neko-agent/packages/agent/src/runtime/**`;
  - owner directories such as `session/`, `artifact/`, `workspace/`, `prompt/`, `skill/`, and `permission/` for incremental moves;
  - `packages/neko-agent/packages/agent/src/__tests__/architecture-boundary-guards.test.ts`.
- Public behavior impact: none intended. The change is an internal architecture and import-boundary normalization.
- Compatibility: this is prelaunch internal code organization. Transitional re-exports may be used only to keep the implementation slice small; they must be documented and removed or tracked in tasks.
