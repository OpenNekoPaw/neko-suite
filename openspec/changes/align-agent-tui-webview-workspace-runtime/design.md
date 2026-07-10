## Context

Neko Agent has moved the default terminal experience to Ink TUI, while the VS Code Webview remains the primary integrated Agent surface. Both surfaces already reuse important runtime pieces such as `AgentSession`, file-backed conversation persistence, project memory, MCP managers, Skill lifecycle runtime, command catalog pieces, content access, and resource cache services.

The drift is in assembly and ownership. Webview uses Extension services such as `ConversationBridge`, `ConfigManager`, `SkillFileService`, VS Code state-backed task storage, and Extension content-access adapters. TUI still manually assembles much of the same runtime through `loadConfig`, `useAgentSession`, `runAgent`, `runInteractive`, TUI-local command ports, TUI-local Skill loading, and file-backed task storage. That creates multiple effective workspace runtimes for the same project.

This change treats the problem as a local product boundary issue: one VS Code client, one terminal TUI, one local workspace, and local host adapters. It does not introduce remote tenants, distributed coordination, cloud locks, or multi-user semantics.

## Goals / Non-Goals

**Goals:**

- Make Webview and TUI consume the same effective workspace Agent runtime policy for config, model defaults, MCP, Skills, commands, context, task records, and project cache.
- Keep host adapters explicit: Extension owns VS Code APIs and Webview projection; TUI owns terminal rendering and headless validation presentation.
- Remove the readline interactive resume path as a default successful interactive path.
- Use canonical workspace-scoped conversation ids for TUI and Webview sessions, including resume requests.
- Make task storage scope explicit instead of accidentally splitting or over-sharing runtime handles.
- Add path-level validation that proves canonical runtime assembly is used and legacy paths do not mask new behavior.

**Non-Goals:**

- Do not redesign Agent Webview UI layout or terminal UI appearance.
- Do not make all Extension-private VS Code state readable by TUI.
- Do not share live terminal/process handles across hosts.
- Do not change Rust Engine, Proto contracts, or durable creative project formats.
- Do not preserve old CLI interactive behavior or `cli-*` conversation id resume as a compatibility success path.
- Do not make `.codex/skills` a hidden Neko Agent workspace input unless it is introduced through an explicit source provider.

## Five-Layer Analysis

**Responsibility**

- Agent runtime owns session assembly, turn execution, context injection, Skill lifecycle projection, and task projection.
- Platform/config owns the effective Agent config snapshot and its diagnostics.
- Skill file runtime owns user/workspace Skill and command discovery.
- Resource cache/content access owns cache materialization, projection, quota, and GC.
- Host adapters own only host effects: VS Code messages, Webview URIs, VS Code extension-contributed capabilities, terminal output, and headless report formatting.

**Dependency**

- Shared contracts stay in Layer 0 packages such as `@neko/shared`, `@neko/agent`, and `@neko/platform`.
- Extension-only adapters may import VS Code APIs but must not leak VS Code handles into host-neutral runtime DTOs.
- TUI code may use Node/terminal adapters but must not fork package-local config, Skill, command, task, or cache rules when a shared foundation exists.
- Webview React code remains projection-only and must not read files, config, cache manifests, or VS Code APIs directly.

**Interface**

- Introduce or reuse a host-neutral workspace runtime assembly input that includes workspace root, host bindings, effective config snapshot, capability providers, content access runtime, task manager, and conversation id.
- Expose effective config as a typed snapshot with diagnostics, not as ad hoc scalar reads from each surface.
- Model task persistence as two interfaces: workspace-visible task records and host-private leases/recovery handles.
- Keep command/Skill definitions host-neutral, with surface-specific effects registered through typed ports.

**Extension**

- New Agent capabilities should attach once to the shared runtime assembly and then project into Webview or TUI through host adapters.
- New host-only commands can be registered as surface effects without changing the shared command definition.
- New Skill sources must declare source scope and precedence instead of being hard-coded in one surface.

**Testing**

- Unit tests should poison old config reads, old Skill loaders, and readline interactive paths to prove canonical paths are hit.
- Contract tests should cover effective config snapshots, canonical conversation ids, command catalog projection, Skill source precedence, and task scope classification.
- Integration tests should cover Webview/Extension handlers and TUI hooks using the same workspace fixtures.
- Agent behavior changes should run focused key-free tests plus a `scripts/agent-eval` case through TUI debug automation when provider/model selection, prompt/Skill behavior, or live event projection changes.

**Proportionality**

This design adds a shared assembly boundary and scope classifiers because the same local workspace has two legitimate hosts. It does not add service discovery, network leases, distributed locks, or remote orchestration. The split between workspace-visible records and host-private leases is the smallest boundary that prevents false sharing of VS Code runtime handles.

**Fail-visible behavior**

Unknown config sections, invalid selected models, missing runtime assembly providers, unregistered command effects, unknown Skill sources, unsupported task scope, and legacy interactive requests after migration must return diagnostics or throw in tests. They must not fall back to defaults, stale Webview state, old readline loops, empty catalogs, or no-op handlers.

## Decisions

### Decision 1: Use a shared Agent workspace runtime assembly path

Webview and TUI session creation will converge on a shared assembly path around the existing Agent runtime session factory and host bindings. The shared path will register core tools, project memory, AGENTS overlays, context settings, task projection, Skill lifecycle runtime, content access, and capability prompt fragments.

TUI may keep terminal stores and presentation hooks, but it should not manually reimplement runtime assembly for interactive sessions.

Rejected alternative: keep Webview and TUI manual assembly in sync by convention. This is the current drift source and will continue to miss new runtime injections.

### Decision 2: Define one effective workspace config snapshot

The effective snapshot will be produced by shared config code and consumed by both Webview and TUI.

Policy:

- User config owns provider/model definitions and credentials.
- Workspace config may select workspace defaults and runtime scalars only when they resolve against available user/account provider and model sources.
- MCP servers continue to merge user and workspace entries by id.
- Runtime-only Webview or TUI choices remain session state and do not rewrite TOML automatically.
- Invalid workspace defaults fail visibly instead of silently falling back to user defaults or hard-coded models.

Rejected alternative: keep TUI reading raw user/workspace TOML while Webview reads `ConfigManager` snapshots. This creates different model and parameter behavior for the same workspace.

### Decision 3: Make TUI interactive and resume canonical

Default TUI startup, initial prompt, and resume will use the Ink TUI session path. TUI conversations and resume requests will use canonical `createConversationId(workDir)` ids. Old `cli-*` ids fail visibly instead of loading pre-migration records. The old readline `runInteractive` path will be removed.

`experiment` may remain a dedicated ablation utility. Scripted Agent behavior acceptance uses `scripts/agent-eval` through TUI debug automation; removed headless Agent runners and package-local real API suites must not return as alternate session owners.

Rejected alternative: keep `--resume` on readline because it already supports prompt input. That preserves two interactive products and prevents path-level validation of TUI session ownership.

### Decision 4: Share Skill and command discovery, separate host effects

Both surfaces will use shared Skill file runtime behavior for:

- `~/.neko/skills`
- `~/.neko/commands`
- `.neko/skills`
- `.neko/commands`

Command artifacts and explicit `$skill` invocations will resolve through shared catalog/runtime contracts. Surface-specific commands such as TUI-only queue menus or Extension-only plugin transfer will be declared as host effects attached to a shared command entry or as explicitly surface-local commands.

`.codex/skills` is not a canonical Neko Agent Skill source. If needed for development, it must be registered through an explicit source provider visible in diagnostics.

Rejected alternative: have TUI scan `skillsDir` and `.codex/skills` while Extension scans `SkillFileService` directories. That makes the workspace catalog surface-dependent.

### Decision 5: Split task records from host-private leases

Task metadata that should be visible for a workspace will use a classified workspace-visible task record store. Runtime handles, terminal/process leases, Extension recovery details, and no-workspace state remain host-private.

This lets both surfaces understand durable task facts without pretending that a VS Code terminal handle can be resumed by TUI or that a TUI process handle can be resumed by Webview.

Rejected alternative: put all tasks in `~/.neko/tasks.json` or VS Code memento. Either choice loses one host's semantics and obscures ownership.

### Decision 6: Align project resource-cache lifecycle

TUI and Webview will use the same project resource-cache root, manifest, quota policy, and GC behavior for workspace project cache. Extension-private cache remains only for no-workspace or Extension-private resources.

Rejected alternative: accept TUI cache as a separate Node implementation without startup GC. That makes cache cleanup and quota behavior host-dependent.

## Risks / Trade-offs

- Config policy may expose existing workspace TOML that only worked in TUI. Mitigation: add diagnostics and migration notes for unsupported workspace provider/model definitions or invalid defaults.
- Converging TUI on runtime factory can disturb terminal stores. Mitigation: first add assembly tests and adapters, then move one session path at a time.
- Task scope split adds an interface. Mitigation: keep it limited to workspace-visible record vs host-private lease, with no remote coordination.
- Removing readline interactive may break direct programmatic callers of `runInteractive`, and old `cli-*` records will not resume. Mitigation: classify as prelaunch breaking cleanup, document replacement, and poison tests against new default use.
- `.codex/skills` removal from implicit TUI loading may surprise development workflows. Mitigation: provide an explicit opt-in source provider or diagnostics rather than hidden TUI-only loading.

## Migration Plan

1. Add shared contracts and tests for effective config snapshot, workspace runtime assembly, Skill/command catalog projection, task scope classification, and canonical TUI conversation id.
2. Poison old interactive/readline and TUI-local config/Skill paths in focused tests.
3. Migrate TUI interactive startup and resume to the canonical TUI session path.
4. Move TUI config loading to the shared effective snapshot policy.
5. Move TUI Skill and command discovery to shared Skill file runtime/catalog behavior.
6. Classify task persistence and add workspace-visible task records or explicit host-private diagnostics.
7. Add TUI project cache startup GC/quota behavior through shared resource-cache services.
8. Remove or quarantine old exports and aliases that can return successful interactive behavior through the legacy path.

Rollback strategy is limited because this is prelaunch cleanup. If a migrated path blocks users, restore only the smallest diagnostic needed to explain the new canonical entrypoint; do not reintroduce successful old readline or `cli-*` resume paths.

## Open Questions

- Should the package name `@neko/cli` be renamed in this change or handled by a later packaging-only cleanup?
- Which task categories need workspace-visible records in the first implementation slice: media tasks only, Agent creation tasks, or all long-running Agent tasks?
- Should a Codex Skill source provider exist for local development, or should `.codex/skills` remain completely outside Neko Agent runtime?
