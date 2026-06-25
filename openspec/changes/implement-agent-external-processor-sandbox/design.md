## Context

Neko Agent is a creator-facing VS Code workflow agent, not a general coding agent. It needs to analyze documents/images, generate storyboard/canvas resources, and invoke media processors such as FFmpeg, ImageMagick, Blender, Python tools, ComfyUI, RIFE, and Real-ESRGAN. Today the repository still has a general `Bash` tool that executes `bash -c` with inherited `process.env`, and several Agent-facing image/document flows historically used local temp paths or direct local paths for display.

The target architecture is recorded in `docs/architecture/adr-agent-sandbox-and-external-processing-boundary.md`, `docs/architecture/cache-file-access-and-paths.md`, and `docs/architecture/asset-library.md`:

- All Agent-visible visual resources must be expressed as `ResourceRef`, source refs, workspace-relative paths, or `${VAR}/path`.
- Webviews display only projected resources through `LocalResourceAccessService` and `webview.asWebviewUri(...)`.
- Processor outputs default to `.neko/.cache/resources` or extension `globalStorageUri/resources`.
- Media library roots are readable inputs, not a default scratch/output location.
- Registration and injection remain separate: a processor being registered does not mean the Agent can execute it.

Risk level: L3. This change touches AI workflow, file/resource access, marketplace trust, local process execution, Webview resource projection, and shared contracts.

## Goals / Non-Goals

**Goals:**

- Define and implement a JSON `ExternalProcessorManifest` contract with fail-visible validation.
- Implement a single `ExternalProcessorRegistry` projection for builtin, project, personal/local, Market, and extension/plugin processors.
- Introduce a Host-owned processor execution adapter that applies root, cwd, env, network, timeout, output, approval, and diagnostic policy.
- Route Agent runtime resource lifecycle actions through a host-agnostic `ProcessorResourcePort`, backed by Extension Host `ResourceCacheService`.
- Ensure processor outputs and Agent document/image handoff use stable `ResourceRef` and managed cache paths, not system temp paths or naked absolute paths.
- Provide minimum GC and retention behavior for processor intermediate/debug/pinned/promoted outputs.
- Disable ordinary creative Agent access to arbitrary shell execution by default, while preserving explicit Developer Mode one-shot execution through the same processor policy path.

**Non-Goals:**

- Full OS sandbox, container, VM, or native entitlement isolation in P0.
- General workflow DAG engine or visual processor graph editor.
- A generic coding-agent command surface.
- Direct Webview access to local files, cache manifests, system temp, or processor output paths.
- Automatic discovery by scanning HOME, PATH, Downloads, Desktop, or arbitrary tool install folders.

## Decisions

### 1. Contracts live in shared/agent type layers before implementation

Add Layer 0 contracts before Host or UI code:

- `ExternalProcessorManifest`
- `ExternalProcessorRootAlias`
- `ExternalProcessorRegistry` and `ExternalProcessorRegistration`
- `ExternalProcessorInvocation`
- `ExternalProcessorDiagnostic`
- `ProcessorResourcePort`
- processor run/stage/provenance and retention DTOs
- env profile and secret policy DTOs

Rationale: Agent runtime, Extension Host, Market, and Webview all need the same contract. Keeping the DTOs in shared/agent type layers prevents feature packages from inventing private manifest, trust, or resource payloads.

Rejected alternative: implement processor execution directly in `neko-agent/packages/extension` first and backfill types later. That would repeat the existing path drift problem around temp paths and Webview projection.

### 2. Registry source and trust remain separate

The registry uses `sourceScope` (`builtin`, `project`, `personal`, `market`, `extension`) alongside existing `AgentCapabilitySource` and `AgentCapabilityTrustLevel` (`core`, `community`, `untrusted`). Project and personal/local processors are source scopes, not new trust levels.

Initial discovery paths:

- Project: `.neko/processors/*.neko-processor.json`
- Personal/local: explicit Settings/UI/CLI registration, stored as `${NEKO_HOME}/processors/*.neko-processor.json` or a variable-backed manifest path
- Market: install target projection
- Extension/plugin: Extension Host contribution
- Builtin: explicit code registration

Registry lifecycle:

- `upsert` handles create and update.
- `unregister` handles uninstall/delete/deactivation.
- `setEnabled` handles policy/user disable while retaining diagnostics.
- `onDidChange` emits revision changes.
- active invocations hold the registration snapshot they started with.

Rationale: this matches existing Capability registration/injection separation and prevents stale Market or extension state from staying executable.

Rejected alternative: let each source feed Agent tools directly. That would make Market uninstall, project file deletion, and trust revocation hard to enforce consistently.

### 3. Processor execution is a Host adapter, not a shell tool

The Agent runtime plans and requests processor invocation. Extension Host resolves the processor registration, validates policy, allocates output paths, applies `PathAccessPolicy`, builds the environment from `envProfile`, and spawns the fixed executable/args from the manifest. The processor receives only authorized input paths and Host-allocated output paths.

The general `Bash` tool is not injected for ordinary creative Agent sessions. Developer Mode one-shot commands become temporary processor requests and still pass through root, cwd, env, output, approval, timeout, and network policy.

Rationale: this gives users real local processing tools without turning the creative Agent into a host shell.

Rejected alternative: sandbox only `Bash`. Claude-style Bash-only sandboxing would not cover built-in file tools, resource projection, Market/plugin capabilities, or Host adapters.

### 4. Output roots are explicit aliases

Allowed root aliases:

- `workspace`
- `mediaLibrary`
- `resourceCache`
- `extensionPrivateResources`

`resourceCache` is the default processor output. With a workspace it maps to `.neko/.cache/resources`; without a workspace it maps to extension `globalStorageUri/resources` and returns an extension-private `ResourceRef`.

`extensionPrivateResources` is legal in manifests but cannot become durable Canvas, Storyboard, Asset, or project facts. Cross-package use requires promote/create asset/link.

Rationale: this resolves the current class of bugs where resources display briefly from a temp path and then fail CSP/local resource authorization.

Rejected alternative: allow processors to choose absolute output paths. That makes Webview projection, cleanup, portability, and provenance unreliable.

### 5. Resource lifecycle is owned by Extension Host ResourceCacheService

Agent runtime never deletes cache files or reads cache manifests. It calls `ProcessorResourcePort` to express resource intent:

- create/update run/stage provenance
- set retention hint
- query `ResourceRef` status
- pin/unpin UI or approval references
- mark intermediate/debug/promoted
- request promote/create asset

Extension Host binds this port to `ResourceCacheService`, `LocalResourceAccessService`, and asset/project services. `ResourceCacheService` owns cache manifest updates, GC, retention metadata, and promote preflight. Asset and project services own durable promoted sources.

Rationale: cache identity and GC are already shared foundation concerns in `@neko/shared/vscode/extension`. Agent runtime should stay host-agnostic.

Rejected alternative: let Skills or processors clean up their own files. That would reintroduce package-local cache managers and hidden file ownership.

### 6. Processor run scope is workflow-scoped and can cross turns

`processorRunId` represents one processor workflow run, not one Agent turn. If a chain pauses for approval or user parameters, the next turn continues the same `processorRunId`. `stageId` identifies a processor invocation inside the run. Retrying the same stage keeps the `stageId` and records a new attempt. Changing the creative target or replanning creates a new run linked by parent provenance.

Rationale: multi-step creative processing often requires approval between steps. Turn-scoped IDs would fragment provenance and retention.

Rejected alternative: use existing IDC `runId` directly for all processor stages. IDC runs and processor chains can overlap but are not the same lifecycle.

### 7. P0/P1 GC is budget-triggered LRU with active protections

P0/P1 must implement at least:

- max byte policy for project/global/extension-private resource cache
- LRU deletion by `lastAccessedAt`/`updatedAt`
- skip pinned, session-active, promoted, non-rebuildable, and outside-managed-root variants
- debug retention for failed/cancelled chains
- manifest update after deletion so variants become `missing` or diagnostic, not false-ready

TTL and byte budgets are product/user settings. Implementation can start with conservative defaults and expose configuration later in the same change if needed.

Rationale: processor-heavy workflows can grow `.neko/.cache/resources` quickly. A minimal GC policy prevents unbounded growth without requiring a full workflow engine.

Rejected alternative: defer GC until after processor support. That would make the first usable version unsafe for repeated image/video generation.

### 8. Env policy is allowlist plus Host secret denylist

Manifest `envProfile` declares allowed inherited/configured/runtime keys. Unknown env keys are not inherited. `denySecrets` defaults to true and cannot be disabled by non-core processors. Host baseline secret denylist overrides allowlist entries for token, secret, password, credential, cookie, SSH agent, cloud provider, registry token, and CI token patterns.

Rationale: media tools need GPU/Python/Blender env, but full env inheritance leaks credentials.

Rejected alternative: inherit full `process.env` and redact obvious keys. This is not fail-closed and is hard to audit.

## Five-Layer Analysis

Responsibility:

- Agent runtime owns planning, approval request, capability injection, run/stage intent, and recovery decisions.
- Extension Host owns file system authority, path resolution, processor execution, local resource roots, Webview projection, and resource cache binding.
- `ResourceCacheService` owns cache manifest, retention metadata, variants, GC, and cache status.
- Market owns package install/uninstall/trust metadata, not processor execution.
- Assets owns durable media library writes/promote flows.

Dependency:

- Layer 0 contracts live in `@neko/shared` or `@neko-agent/types`.
- Agent runtime remains host-agnostic and does not import VS Code, Node process execution, Webview, or `ResourceCacheService`.
- Extension Host imports VS Code and shared host adapters.
- Webview consumes projected DTOs only.
- Feature packages do not import each other's internals.

Interface:

- Processor manifest is JSON and versioned.
- Registry emits normalized projections and diagnostics.
- Invocation results return `ResourceRef`, provenance, status, and diagnostics.
- Approval UI receives bounded policy summaries, not raw local commands or secret env.
- Resource port is an intent interface, not a cache-file API.

Extension:

- New processor sources can be added by writing registry adapters.
- New env profiles can be added as Host policy templates.
- New output roots require explicit root alias and PathAccessPolicy support.
- Future OS sandbox can wrap the Host execution adapter without changing Agent planning.

Testing:

- Contract tests cover manifest validation, registry projection, root aliases, trust mapping, env policy, and diagnostics.
- Runtime unit tests cover injection, approval gating, Developer Mode, and shell non-injection.
- Extension tests cover PathAccessPolicy, resource output allocation, ResourceCacheService binding, lifecycle events, and GC.
- VS Code Webview runtime smoke covers projected resource display and CSP behavior.
- Market tests cover install/uninstall/revocation lifecycle.

## Risks / Trade-offs

- [External tools that work in shell may fail in Neko] → Provide env profile templates for GPU, Python venv, Blender, and ComfyUI; diagnostics should name the missing allowlisted env or executable path.
- [Registry and capability runtime can drift] → Make Agent runtime consume only registry projection; test that source records and raw manifest files are not used directly.
- [Developer Mode can become a backdoor] → One-shot command remains a temporary processor request and cannot become persistent `Bash(*)` allow.
- [GC may delete useful intermediate resources] → Use pinned/debug/promoted retention and active variant keys; keep diagnostics after GC.
- [Market processor packages add trust complexity] → Reuse Market install target, publisher, trustLevel, entitlement, revocation, and diagnostics rather than a separate processor marketplace.
- [Prelaunch breaking path rejection can affect current fixtures] → Update fixtures and tests to use `ResourceRef`/managed cache; reject old temp-path payloads with diagnostics.

## Migration Plan

1. Add contracts and validators while keeping old runtime paths unchanged.
2. Introduce registry and Host binding behind explicit processor capability registration.
3. Route document/image/processor resource handoff through `ResourceRef` and resource cache.
4. Disable ordinary creative Agent `Bash` injection by default; keep Developer Mode through processor request path.
5. Add GC/retention metadata and run/stage provenance.
6. Remove or poison legacy temp-path display handoffs so tests fail if they are used as success paths.
7. Wire Market/personal/project/extension lifecycle sources into the registry.

Rollback:

- Contracts can remain while processor execution registration is disabled.
- Existing document/image reading can continue if it emits managed `ResourceRef`.
- Developer Mode can be disabled if processor execution policy is incomplete.
- Do not roll back to system temp Webview projection as a success path.

## Open Questions

- Exact default cache byte budgets and debug TTL values need product tuning.
- Whether processor management UI lives in Agent settings, Market management, or a shared extension command surface can be decided during implementation.
- P2 OS sandbox implementation technology is deferred: macOS Seatbelt, Linux bubblewrap, Windows container/WSL, or isolated worker process.
