## Context

Neko Suite already has a shared Webview-side VS Code API module in `@neko/shared/vscode`, but Webview packages use it inconsistently. Some packages call `acquireVsCodeApi()` directly in app roots, some keep package-local singleton wrappers, some expose globals such as `__vscode_api__`, and others use the shared module through a typed facade.

This is an L2 Webview and L1 Extension-message-boundary cleanup. It does not change durable project data, Engine authority, or Extension Host ownership of workspace/URI access. The user-visible behavior should remain the same: Webviews still send typed messages to their owning Extension Host; the change standardizes how the browser sandbox obtains and uses the VS Code Webview API.

### Current patterns observed

- Shared canonical module: `packages/neko-types/src/vscode/api.ts`.
- Thin shared adoption: `neko-agent` and `neko-tools` already import `@neko/shared/vscode`.
- Re-export wrapper: `neko-cut` re-exports shared bridge helpers but still has domain-specific message types.
- Package-local wrappers or direct acquisition remain in Canvas, Dashboard, Live, Market, Preview, Sketch, Story, and some feature components.
- Preview has a package-local persisted state hook based on a package-local bridge wrapper.
- Multiple tests mock `acquireVsCodeApi()` directly, making test setup drift with implementation details.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | `@neko/shared/vscode` owns singleton API acquisition, safe post/state/request helpers, and request-response plumbing. Each Webview package owns its message union, typed action builders, handler registry, and domain side effects. Extension Host owns command handling, resource authorization, workspace access, and VS Code API calls. |
| Dependency | The shared bridge must remain browser/Webview-only and must not import React, VSCode, Node, Extension code, or feature packages. Webviews depend on `@neko/shared/vscode` or package-local typed facades that compose it. Extension packages do not import Webview bridge code. |
| Interface | The shared interface stays small: `getVSCodeAPI`, `postMessage`, `getState`, `setState`, `sendRequest`, request cancellation, and pending request diagnostics. Domain message types stay local and wrap these primitives. |
| Extension | New Webviews can add a typed facade by importing the shared bridge and defining their message union only. Adding a new request-response flow should not require a new singleton or global API shim. |
| Testing | Shared unit tests cover singleton acquisition, dev no-op behavior, state helpers, request-response success/error/timeout/cancel behavior, and duplicate listener safety. Package tests cover domain facades and ready/state messages. Boundary tests prevent direct acquisition outside approved files. VS Code Webview runtime smoke validates representative migrated paths. |

## Goals / Non-Goals

**Goals:**

- Establish `@neko/shared/vscode` as the canonical Webview-side bridge primitive.
- Replace package-local direct `acquireVsCodeApi()` usage with shared bridge usage or typed package facades.
- Preserve package ownership of domain message contracts.
- Make bridge behavior testable without each package inventing a separate mock.
- Add guardrails so new Webview code does not reintroduce direct VS Code API acquisition.
- Keep dev/test behavior deterministic when running outside VS Code.

**Non-Goals:**

- Introduce a new global RPC protocol.
- Move domain message unions into `@neko/shared`.
- Change Extension Host message handlers or command semantics unless a handler currently depends on a package-local bridge quirk.
- Convert all message flows to request-response.
- Redesign i18n, logger, ErrorBoundary, media playback, or UI primitives in this change.

## Decisions

1. **Use `@neko/shared/vscode` as the only API acquisition implementation.**
   - The shared module owns the single-call rule for `acquireVsCodeApi()` and the fallback behavior for non-VS Code environments.
   - Package-local bridge modules may remain only as typed facades that delegate to the shared module.
   - Alternative considered: keep one bridge wrapper per package. Rejected because it repeats the most sandbox-sensitive part of the Webview boundary and lets subtle differences accumulate.

2. **Keep package-local typed facades for domain protocols.**
   - A package facade can expose functions such as `marketMessages.search(...)`, `previewPostMessage(...)`, or `canvasBridge.requestSave(...)`, but it must call shared `postMessage` or `sendRequest`.
   - Rationale: shared code should not know every domain message union, and moving all message contracts to L0 would turn `@neko/shared` into a feature registry.
   - Alternative considered: define one global `NekoWebviewMessage` union. Rejected because it would couple independent feature packages and force broad edits for local protocol changes.

3. **Prefer migration by adapter, then cleanup.**
   - First, update package facades to compose the shared bridge.
   - Then migrate direct app/component calls to those facades or the shared primitive.
   - Finally, delete obsolete singleton wrappers and globals.
   - Rationale: this limits behavior changes and lets each package keep its message tests focused.
   - Alternative considered: rewrite all message handling in one pass. Rejected because it increases blast radius and risks changing Extension/Webview protocol semantics accidentally.

4. **Make direct acquisition a guarded exception.**
   - Direct `acquireVsCodeApi()` references are allowed only inside the shared bridge module, test fixtures that explicitly mock the browser API, or temporary documented migration shims.
   - Guardrails should scan production Webview source, not generated `dist` output.
   - Alternative considered: rely on review discipline. Rejected because this duplication already reappeared across many packages.

5. **Unify bridge test utilities around the shared module.**
   - Shared tests should provide a predictable mock acquisition API and reset hooks.
   - Package tests should mock package facades or shared bridge outputs instead of constructing unique global API shapes.
   - Alternative considered: keep package-specific global mocks. Rejected because it ties tests to local wrappers that this change is meant to remove.

6. **Treat persisted Webview state as bridge-owned transport, not project data.**
   - `getState` and `setState` remain suitable for recoverable UI/session state.
   - Durable project facts remain in project files or Extension-owned stores and are not moved by this change.
   - Alternative considered: migrate Preview document state into a new shared persistence hook. Deferred because that is broader than bridge acquisition and should be a later UI-state proposal if needed.

## Risks / Trade-offs

- [Risk] A shared bridge change breaks many Webviews at once. -> Mitigation: keep the shared surface small, migrate package by package, and preserve typed package facades where possible.
- [Risk] Request-response listener behavior conflicts with package message listeners. -> Mitigation: shared request-response handling only consumes `_requestId` responses and does not replace domain listeners.
- [Risk] Dev-mode no-op behavior hides missing VS Code context during runtime validation. -> Mitigation: unit tests can assert no-op behavior, but acceptance for migrated paths must include VS Code Webview runtime smoke.
- [Risk] Static guardrails flag tests or documentation. -> Mitigation: scope checks to production `packages/*/packages/webview/src` files and allow explicit test/setup exclusions.
- [Risk] Existing globals such as `__vscode_api__` are used by helpers. -> Mitigation: migrate helpers to injected or imported bridge facades before deleting globals.
- [Risk] Package facades become thin duplicates forever. -> Mitigation: allow thin facades only when they add domain typing or naming; otherwise import the shared bridge directly.

## Migration Plan

1. Add or tighten shared bridge tests for acquisition, state, request-response, timeout, cancellation, and no-op outside VS Code.
2. Introduce a shared Webview bridge test utility if existing package tests need a consistent mock.
3. Convert package bridge wrappers in a low-risk order:
   - already-close packages: Cut, Agent, Tools;
   - simple direct wrappers: Dashboard, Market, Live;
   - stateful/document wrappers: Preview;
   - larger app-root direct acquisition: Canvas, Sketch, Story, Audio, Model, Puppet.
4. Update package-local typed facades to delegate to the shared bridge while preserving message types and exported helper names when practical.
5. Replace component-level direct `postMessage` or global bridge access with package facade calls where domain typing is useful.
6. Remove obsolete globals and duplicate singleton wrappers after all local callers are migrated.
7. Add production-source guardrails that fail on direct `acquireVsCodeApi()` outside the shared bridge or approved migration shims.
8. Run focused package tests after each migration group, then dependency/boundary checks and VS Code Webview runtime smoke for representative ready/state/request paths.

## Rollback Strategy

Because message payload semantics should not change, rollback is package-local: a migrated package facade can be temporarily restored to the previous wrapper while the shared bridge remains available for other packages. No project file rollback or data migration is required.

## Open Questions

- Should `@neko/shared/vscode` expose an explicit test reset hook, or should tests isolate modules and mock `window.acquireVsCodeApi()` only?
- Should the final guardrail live in an existing boundary check command or a new focused script such as `pnpm check:webview-bridge`?
- Should temporary package-local migration shims be allowed for one change only, or should they be retained as deprecated re-exports for packages with many imports?
