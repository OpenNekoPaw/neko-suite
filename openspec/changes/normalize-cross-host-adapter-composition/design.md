## Context

Neko has already introduced several pieces of the desired architecture:

- `@neko/host` defines primitive local host ports for environment, workspace, files, paths, secrets, external opening, diagnostics, and access policy.
- Workbench Core defines contribution and feature Webview adapter descriptors so package-owned UI can be registered by hosts.
- TUI has a concrete Node host adapter and consumes Agent/platform services directly.
- VSCode Extension owns the most complete Agent Webview host implementation through Webview `postMessage`, handlers, config bridge, conversations, tasks, skills, file operations, and command routing.
- Desktop consumes several package-owned feature adapter surfaces, but Agent uses a partial Electron bridge and a global VSCode-compatible shim.

The remaining gap is composition. There are currently three adapter shapes rather than one policy:

```text
TUI
  Ink UI -> Node host ports -> Platform/Agent runtime

VSCode
  Agent Webview -> VSCodeMessages -> Extension ChatProvider/router -> Platform/Agent runtime

Desktop
  Desktop Shell
    -> Feature HostAdapterSurface / CutWebviewRoot
    -> window.vscodeApi shim -> Electron IPC -> partial Agent host
```

This change does not replace the existing lower-level work. It defines how the host roots compose it so feature packages do not grow their own `vscode`, `node`, and `electron` implementations.

## Goals / Non-Goals

**Goals:**

- Make `vscode`, `node`, and `electron` explicit canonical host adapter implementations at composition roots.
- Keep feature packages as owners of feature UI, runtime descriptors, domain message contracts, codecs, and capability providers.
- Prevent feature packages from implementing package-local host stacks for VSCode/Node/Electron when shared host ports or injected host runtimes exist.
- Introduce a host-neutral Agent runtime adapter so VSCode and Desktop can host the same Agent Webview behavior without relying on `VSCodeMessages` as the cross-host API.
- Keep TUI host behavior headless and runtime-oriented rather than forcing it through a Webview transport abstraction.
- Scope Desktop runtime channels so multiple package roots in one Electron renderer cannot receive each other's messages.
- Make missing host handlers fail visibly with diagnostics and route coverage tests.
- Preserve existing user/workspace `.neko` config and durable `nk*` project files.

**Non-Goals:**

- Do not fork VSCode, rewrite the Workbench, or replace the VSCode Extension Host.
- Do not redesign feature UI, theme palettes, or editor layout in this change.
- Do not make every package import `@neko/host` directly if it only needs projected UI props or a package-owned facade.
- Do not make TUI render the Agent Webview, Monaco, or creative editors.
- Do not introduce remote multi-tenant services, distributed plugin hosts, network leases, or cloud-scale service discovery.
- Do not migrate every existing Webview package away from `@neko/shared/vscode` in one step; migrate canonical Agent and shared host-neutral surfaces first, then add guardrails for new code.

## Five-Layer Analysis

**Responsibility**

- `@neko/host` owns primitive host contracts only.
- VSCode, Node/TUI, and Electron/Desktop composition roots own concrete host adapters.
- Workbench Core owns host capability descriptors, contribution validation, and adapter registry rules.
- Feature packages own package UI, domain runtime descriptors, codecs, message DTOs, capability providers, and package-local thin facades.
- Agent runtime owns conversation/task/skill/session behavior; Agent Webview owns presentation and consumes an injected host runtime.

**Dependency**

- Layer 0 contracts remain free of VSCode, Electron, Node process APIs, React, and feature package internals.
- VSCode adapter code may import `vscode`, but only in Extension composition roots and transport adapters.
- Electron adapter code may import Electron main/preload APIs, but renderer UI consumes typed bridge/facade props rather than Electron directly.
- Node adapter code may use Node filesystem/path/process APIs, but only in TUI/headless host roots.
- Webview React code must not import Node filesystem, Extension implementation modules, or concrete Electron/VSCode APIs for host effects.

**Interface**

- Host adapters expose small, capability-oriented ports rather than broad service bags.
- Package descriptors declare `supportedHosts` and `requiredHostCapabilities`; they do not implement host capability plumbing.
- Agent Webview consumes `AgentHostRuntimeAdapter` for send/subscribe/state and typed service requests.
- Desktop runtime channels include runtime identity so Agent, Cut, Canvas, and future plugin roots cannot share a global unscoped bus.
- Diagnostics use explicit unsupported-handler, unknown-runtime, missing-capability, and invalid-message states.

**Extension**

- Adding another host, such as Tauri, requires a new composition root adapter, not changes in every feature package.
- Adding a feature package requires descriptors and host-neutral surfaces; host roots register those descriptors and supply capabilities.
- Adding an Agent message requires updating a shared route map and host implementations for VSCode/Desktop, with TUI mapped only when the behavior has headless meaning.
- Adding plugin UI should reuse Workbench contribution descriptors and scoped runtime channels instead of inventing another transport path.

**Testing**

- Contract tests cover host capability registry behavior, descriptor validation, route coverage, and fail-visible unsupported handlers.
- Agent Webview tests mock `AgentHostRuntimeAdapter` rather than `window.vscodeApi`.
- VSCode adapter tests keep Extension/Webview route behavior covered through existing handler tests and VSCode runtime smoke where required.
- Electron adapter tests cover IPC channel scoping, Agent config/conversation/task/skill parity, and no global message leakage.
- TUI tests continue to cover Node host ports, content access, config snapshots, task storage, and Agent runtime behavior.

**Proportionality**

The abstraction is limited to local host composition because Neko is a local client plus local Rust Engine. It avoids service registries, remote tenancy, and distributed state. The adapter split is justified now because three real hosts already exist and Desktop is already showing drift from VSCode Agent behavior.

**Fail-visible behavior**

Unknown runtime ids, unregistered adapter descriptors, unsupported Agent message handlers, missing host capabilities, invalid IPC channel payloads, and attempts to use the global VSCode shim as a canonical new path must fail with diagnostics or tests. They must not return empty data, no-op success, stale config, or fallback UI.

## Decisions

### Decision 1: Host implementations live only at composition roots

The canonical implementations are:

- VSCode adapter: Extension composition root, Webview providers, custom editor providers, resource projection, VSCode commands/storage/tree view integration.
- Node adapter: TUI/headless composition root, Node fs/path/env/process, direct Platform/Agent runtime bootstrap, content access, task storage.
- Electron adapter: Desktop main/preload/renderer bridge, scoped IPC, window/menu integration, workspace file/resource access, viewport sessions, Desktop Agent host.

Feature packages do not implement all three. They expose host-neutral descriptors, props, facades, codecs, and capability providers.

Rejected alternative: every feature package exports `createVSCodeAdapter`, `createNodeAdapter`, and `createElectronAdapter`. This would duplicate host policy in every package and make package UI drift the default.

### Decision 2: Keep two adapter planes

The lower plane is `@neko/host` primitive ports. It handles local filesystem, paths, workspace, trust/access policy, secrets, external opening, and diagnostics.

The upper plane is host-runtime composition. It handles Workbench contribution registration, Webview/Agent runtime messages, UI state, service request routing, and runtime channel scoping.

Rejected alternative: expand `@neko/host` until it includes Agent conversations, Webview transport, custom editors, and plugin UI. That would turn a primitive contract package into a Workbench/Agent domain aggregator.

### Decision 3: Agent Webview gets an injected host runtime adapter

Agent Webview should depend on a host-neutral runtime facade, conceptually:

```ts
interface AgentHostRuntimeAdapter {
  readonly hostKind: 'vscode' | 'electron';
  send(message: WebviewToExtensionMessage): void;
  subscribe(listener: (message: ExtensionToWebviewMessage) => void): Disposable;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}
```

Service-specific methods may remain as typed message builders or be layered above this facade, but the Webview root must not treat `VSCodeMessages` as the cross-host API.

Rejected alternative: keep `VSCodeMessages` and make Desktop emulate VSCode forever. This works for a narrow config bridge but breaks down with multiple runtimes, route coverage, state ownership, and host-specific effects.

### Decision 4: TUI maps to runtime services, not Webview transport

TUI is the `node` adapter for headless Agent/runtime behavior. It should keep direct calls into Platform, Agent runtime, content access, task storage, Skills, commands, and capability providers. It does not implement `AgentHostRuntimeAdapter` unless a test harness needs to simulate Webview transport.

Rejected alternative: make TUI consume Agent Webview messages for parity. That would force terminal behavior through UI transport and duplicate presentation state.

### Decision 5: Desktop runtime channels must be scoped

Desktop may host multiple package roots in one renderer. Electron bridge messages therefore need runtime identity or scoped channel injection. The current global `window.vscodeApi` shim can remain only as a migration adapter for existing Webview code, with fail-visible diagnostics and a removal condition.

Rejected alternative: one global VSCode-compatible shim for all Desktop package roots. This lets Agent responses leak toward non-Agent roots and requires hosts to ignore valid-looking messages from unrelated packages.

### Decision 6: Desktop Agent parity is route-level, not result-level

Desktop must implement the same Agent host message routes required by the shared Agent Webview surface, or return an explicit unsupported diagnostic. Empty conversation/task/skill snapshots are acceptable only for a deliberate empty workspace state, not as a placeholder for missing handlers.

Rejected alternative: keep returning empty snapshots until features are implemented. That makes Desktop look connected while silently missing Agent capabilities.

### Decision 7: Shared foundation context flows through host adapters

Theme, i18n, logger, error handling, keyboard/focus, resource URLs, and diagnostics should be initialized through shared Webview foundations and host-provided context. VSCode and Desktop can style/frame differently at shell level, but package components should receive the same foundation inputs.

Rejected alternative: allow Desktop-local CSS/foundation replacements for package Webviews. That recreates the two-UI maintenance problem the Desktop work is intended to remove.

### Decision 8: Guardrails enforce ownership

Add checks or focused tests that block new production direct `window.vscodeApi`, `acquireVsCodeApi`, Node fs/path, Electron IPC, or package-local adapter implementations in feature Webview code except in approved host adapter files.

Rejected alternative: rely on code review. The existing drift came from reasonable local fixes; guardrails are needed because the boundary is cross-cutting.

## Risks / Trade-offs

- [Risk] The injected Agent adapter migration touches many Webview call sites. -> Mitigation: first introduce a compatibility facade with the same message builder surface, then migrate imports path-by-path with tests.
- [Risk] Desktop Agent parity grows too large for one implementation slice. -> Mitigation: implement route groups in order: config/settings, conversations/tabs, tasks/queues, skills/commands, file/search, plugin/capability, and leave unsupported groups fail-visible.
- [Risk] Guardrails may block legitimate package-local domain facades. -> Mitigation: allow thin package facades that delegate to shared host adapters and document approved exceptions with owner/removal criteria.
- [Risk] `@neko/host` could grow beyond primitive ports. -> Mitigation: boundary tests and review rule: Agent/Webview/Workbench runtime contracts live outside `@neko/host`.
- [Risk] VSCode-specific behavior is accidentally weakened while abstracting transport. -> Mitigation: keep `@neko/shared/vscode` as the VSCode transport implementation and validate Extension Development Host Webview behavior for VSCode-sensitive paths.
- [Risk] Desktop scoped channels require a short-lived migration shim. -> Mitigation: make the shim diagnostic, scoped to known legacy roots, and poison it in tests for newly migrated surfaces.

## Migration Plan

1. Add cross-host adapter composition specs and tests around existing `@neko/host` and Workbench descriptor boundaries.
2. Define `AgentHostRuntimeAdapter` and a compatibility message-builder facade in the Agent Webview package.
3. Implement VSCode Agent host adapter by wrapping the existing Extension Webview transport and route handlers.
4. Implement Electron Agent host adapter by replacing Desktop's global Agent shim with scoped runtime channels and route coverage diagnostics.
5. Migrate Agent Webview root and high-traffic components from `VSCodeMessages` imports to the injected facade.
6. Expand Desktop Agent host route parity in slices: config/settings, conversations/tabs, tasks/queues, skills/commands, file/search, plugin/capability.
7. Connect Desktop resource/content/file operations to host ports and shared content/project-file services where package Webviews need them.
8. Add guardrails that prevent new host-specific API imports in feature package UI outside approved adapter files.
9. Remove or quarantine the Desktop global VSCode shim for migrated runtime roots.

Rollback strategy: keep VSCode adapter behavior unchanged while introducing the facade. If Desktop route migration fails, disable the affected Desktop runtime surface with a diagnostic rather than falling back to empty snapshots or the global shim. No durable project data migration is involved.

## Open Questions

- Should `AgentHostRuntimeAdapter` live in `@neko-agent/types`, `@neko-agent/webview`, or a small neutral package under Agent platform contracts?
- Should Electron and VSCode share an Agent route coverage fixture generated from `WebviewToExtensionMessage`, or should coverage remain host-specific with a shared assertion helper?
- Which Desktop Agent route group should follow config/settings first: conversations/tabs or file/search?
- Should feature packages consume `@neko/host` directly for non-React headless services, or should most UI-facing packages consume only package-owned facade props?
