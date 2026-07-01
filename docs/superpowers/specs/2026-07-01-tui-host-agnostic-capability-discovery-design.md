# TUI Host-Agnostic Capability Discovery Design

Date: 2026-07-01

## Context

`neko-agent` has two user-facing Agent surfaces:

- Webview: GUI-oriented, backed by the VSCode Extension Host, with rich controls, media previews, cards, and editor actions.
- CLI/TUI: terminal-oriented, backed by Ink and Node runtime, with command-first controls, streamed text, selection menus, and reference-only output.

The current capability injection model is centered on the VSCode Extension Host. Feature packages register Agent capabilities by calling `vscode.commands.executeCommand('neko.agent.registerCapabilities', provider)`. `neko-agent` receives those providers through `CapabilityDiscoveryService`, then registers contributed tools, tool groups, prompt fragments, skills, provider cards, and artifact facets into the shared Agent runtime.

That model works for Webview and extension-launched Agent sessions, but it is the wrong ownership boundary for TUI. The TUI must not depend on VSCode APIs, extension packages, Webview components, or GUI/editor state. It should consume the same host-agnostic capability contracts as other hosts, while loading only capabilities that explicitly support terminal/headless execution.

This design complements the existing `align-agent-tui-control-surface` work. That change aligned TUI commands, model controls, `$` skills, `@` references, context compaction, queue controls, timeline projection, and artifact reference formatting. This design addresses the remaining gap: TUI does not yet receive other package capabilities through a host-agnostic discovery path.

## Goals

- Let TUI discover and register terminal-safe capabilities from other packages without importing VSCode or extension implementations.
- Reuse the Agent runtime capability contracts for tools, tool groups, prompt fragments, provider cards, reference contributors, and diagnostics.
- Make capability availability explicit through host requirements and runtime requirements.
- Support TUI-safe `@` reference search across assets, story, canvas, and other local content sources.
- Preserve Webview/Extension dynamic registration as a VSCode adapter, not as the TUI dependency path.
- Fail visibly when a provider claims TUI support but requires unavailable host services.

## Non-Goals

- Do not render images, video, audio, Canvas, Timeline, or Webview cards in TUI.
- Do not import `vscode` from `cli-tui`.
- Do not import `packages/*/extension` implementation modules from `cli-tui`.
- Do not port Webview React components or CSS into TUI.
- Do not add `!` shell command support.
- Do not build a remote capability service, daemon, marketplace resolver, or multi-user orchestration layer.
- Do not make every existing VSCode capability available in TUI. Editor-bound actions may remain unavailable.

## Existing Architecture

Current VSCode capability flow:

```text
feature package extension
  -> vscode.commands.executeCommand("neko.agent.registerCapabilities", provider)
  -> CapabilityDiscoveryService
  -> CapabilityRegistryRuntime
  -> Agent session runtime
```

Desired host-agnostic shape:

```text
feature package capability contribution
  -> shared capability registry/runtime
  -> TUI loader or VSCode adapter
  -> Agent session runtime
```

The important change is ownership: capability definitions that can run without VSCode should live behind host-agnostic provider factories. VSCode extension registration becomes one adapter over that contract. TUI gets its own loader over the same contract.

## Design Decisions

### 1. TUI uses a host-agnostic capability loader

Introduce a TUI capability loader that lives outside VSCode-specific code. It should build a capability runtime from local, terminal-safe sources:

- built-in Agent/TUI capabilities;
- filesystem skills and command artifacts;
- MCP tools already configured for CLI/TUI;
- package-level headless providers that declare `tui` or `cli` support;
- provider cards and prompt fragments from runtime provider card directories;
- reference contributors that can operate from local files or injected host-agnostic ports.

The loader must not call VSCode commands and must not depend on extension activation.

### 2. Capability metadata declares host and runtime requirements

The existing capability protocol already has `hostRequirements`. This design makes those requirements meaningful for TUI loading.

Provider-level metadata:

```ts
hostRequirements?: readonly AgentCapabilityHostRequirement[];
```

Capability/tool-level metadata should also be able to express runtime requirements. The exact type can be introduced in `@neko/shared` or projected through existing tool metadata:

```ts
interface AgentCapabilityRuntimeRequirements {
  readonly vscode?: boolean;
  readonly activeEditor?: boolean;
  readonly mediaService?: boolean;
  readonly engineBridge?: boolean;
  readonly contentAccess?: boolean;
  readonly writableProject?: boolean;
}
```

TUI only loads a provider or tool when:

- it explicitly supports `tui` or `cli`;
- it does not require `vscode`;
- it does not require active editor state;
- all required host-agnostic ports are available;
- mutation tools are confirmation-gated and expose target requirements.

Missing requirements produce diagnostics, not silent omission.

### 3. Extension remains an adapter

The existing VSCode dynamic registration path should remain supported:

```text
VSCode extension package
  -> create provider
  -> executeCommand("neko.agent.registerCapabilities", provider)
```

However, the provider should increasingly be composed from shared provider factories:

```text
shared headless provider factory
  -> TUI loader
  -> VSCode provider wrapper
```

VSCode-only tools can stay in extension wrappers. TUI-safe tools should move behind headless factories that do not import VSCode.

### 4. TUI displays capability availability

TUI should expose capability diagnostics through `/status` and a dedicated `/capability` command family.

Minimum commands:

- `/capability list`: provider id, version, loaded tool count, skipped tool count, prompt fragments, provider cards.
- `/capability show <provider>`: loaded contributions and unavailable reasons.
- `/capability tools [provider]`: terminal-safe tools currently registered.
- `/status`: compact capability summary and first diagnostic if degraded.

The command surface should use the existing TUI command router and fail visibly for unknown providers or missing runtime ports.

### 5. `@` reference search uses reference contributors

`@` suggestions should aggregate terminal-safe reference contributors. The contributor contract should be host-agnostic and return textual reference candidates:

- label;
- source kind;
- stable id or URI;
- optional workspace-relative path;
- optional short description;
- optional media/document metadata;
- unavailable reason when the source cannot be queried.

TUI inserts stable textual references. It must not create Webview chips, previews, blob URLs, or Webview URIs.

Initial contributors:

- Assets: list/search asset entities and insert asset ids or resource refs.
- Story: search screenplay index and insert script scene refs.
- Canvas: expose active/project canvas summaries where available through headless ports.
- Filesystem: existing file reference search.

### 6. Prompt fragments and provider cards are runtime inputs

TUI Agent sessions should receive prompt fragments and provider cards from the capability runtime. This brings TUI closer to Webview behavior without GUI coupling:

- story syntax conventions;
- audio project conventions;
- canvas subsystem conventions;
- provider/model expression cards.

Prompt fragments are runtime context, not user-visible command help. Provider cards affect model/provider expression and should reuse existing provider card registry behavior.

## Component Plan

### Shared contracts

Owns:

- host/runtime requirement types;
- capability availability diagnostics;
- optional reference contributor contracts;
- TUI-safe metadata helpers if needed.

Must not depend on VSCode, DOM, React, or feature package internals.

### Agent runtime

Owns:

- `CapabilityRegistryRuntime` reuse for TUI;
- capability diagnostics and collision handling;
- projection of capability runtime into `createAgentSessionWithRuntime`;
- prompt fragment and provider card registration.

The existing runtime already supports most of this. The main work is to ensure TUI can build and pass the same runtime bindings.

### CLI/TUI

Owns:

- `createTuiCapabilityLoader`;
- command-router ports for `/capability`;
- TUI session bootstrap integration;
- reference suggestion aggregation;
- terminal-only capability status formatting.

TUI must continue to depend only on host-agnostic packages such as `@neko/agent`, `@neko/shared`, `@neko/platform`, and `@neko-agent/types`.

### Feature packages

Own:

- headless-safe provider factories where capability logic can run outside VSCode;
- VSCode wrapper providers for editor-bound tools;
- host/runtime requirement declarations;
- tests proving TUI-safe providers do not import VSCode.

Initial package classification:

| Package | TUI-safe first slice | VSCode-only or deferred slice |
| --- | --- | --- |
| `neko-assets` | list/get assets, asset reference search | GUI reveal/import flows that require editor UI |
| `neko-story` | screenplay index/search, Fountain prompt fragments | VSCode document/editor commands |
| `neko-canvas` | markdown/storyboard validation, read-only context summaries, prompt fragments | reveal workspace, direct Canvas UI mutation |
| `neko-audio` | project info, list tracks, loudness/file analysis | active audio editor mutations |
| `neko-cut` | timeline info if exposed through host-agnostic project port | reveal/import timeline editor actions |
| `neko-model` | read-only scene summaries if a headless project port exists | active editor scene mutations/playback |
| `neko-sketch` | none by default unless media + project ports are provided | import generated images into active sketch editor |
| `neko-puppet` | parameter generation with no apply, if LLM port is available | apply to active puppet editor |
| `neko-engine` | engine tools only if a non-VSCode engine bridge exists | `vscode.commands` engine dispatch |

## Data Flow

TUI startup:

```text
load config/workDir
  -> create MCP manager + tool registry
  -> create skill service
  -> create TUI capability loader
  -> discover headless-safe providers
  -> register tools/groups/fragments/cards/reference contributors
  -> create Agent session with capability runtime
  -> render status + capability diagnostics
```

Reference search:

```text
InputEditor sees "@"
  -> reference suggestion aggregator
  -> contributor.search(query, context)
  -> terminal-safe candidates
  -> insert textual reference
  -> InputProcessor resolves/validates reference for prompt
```

Tool execution:

```text
Agent calls registered tool
  -> tool checks required ports/targets
  -> read-only tool executes directly
  -> mutation tool requests confirmation
  -> result renders as text/reference summary
```

## Error Handling

Use fail-visible diagnostics:

- Provider declares `tui` support but imports VSCode: architecture test failure.
- Provider has unsupported protocol version: skip with diagnostic.
- Provider requires missing port: skip affected contribution with reason.
- Tool collision: use existing collision diagnostics; do not silently override.
- Reference contributor fails: show source-level unavailable reason.
- Unknown `/capability` provider or tool: command error.
- Mutation tool without confirmation metadata: reject from TUI loader.

Diagnostics should include provider id, contribution name, requirement, host, and reason.

## Testing Strategy

Focused tests:

- TUI capability loader loads TUI-safe providers.
- TUI capability loader skips VSCode-only providers with diagnostics.
- Runtime requirement filtering handles `mediaService`, `contentAccess`, `engineBridge`, and `activeEditor`.
- Tool name collisions are visible.
- Prompt fragments and provider cards reach TUI Agent session config.
- `/capability list/show/tools` format expected summaries.
- `@` suggestions aggregate filesystem/assets/story/canvas candidates.
- TUI architecture guard rejects `vscode` and `packages/*/extension` imports.
- Provider factories marked TUI-safe compile without VSCode imports.

Validation commands should start narrow:

```bash
pnpm --filter @neko/agent-cli-tui test
pnpm --filter @neko/agent test
pnpm check
```

If full `pnpm check` is blocked by existing workspace issues, record the blocker and run the narrowest equivalent `tsc --noEmit` and Vitest suites for changed packages.

## Migration Plan

1. Add or formalize host/runtime requirement metadata and diagnostics.
2. Add TUI capability loader using existing `CapabilityRegistryRuntime`.
3. Wire loader output into TUI session bootstrap and `createCliAgentRuntime`.
4. Add `/capability` command family and `/status` summary.
5. Add reference contributor aggregation for `@`.
6. Extract the first TUI-safe provider factories from `neko-assets` and `neko-story`.
7. Add `neko-canvas` and `neko-audio` safe subsets.
8. Classify remaining packages with unavailable reasons.
9. Keep VSCode registration path working by wrapping shared providers from extension packages.

## Acceptance Criteria

- TUI starts without any VSCode dependency.
- `cli-tui` has no imports from `vscode` or feature package extension implementation paths.
- `/capability list` shows loaded and skipped providers with reasons.
- `/status` includes capability summary.
- TUI Agent sessions include loaded prompt fragments and provider cards.
- `@` suggestions include terminal-safe non-file references when providers are available.
- VSCode-only tools do not appear in TUI tool registry.
- Existing Webview/Extension capability registration still works.
- Tests cover loading, filtering, diagnostics, command output, reference search, and architecture boundaries.

## Risks And Trade-Offs

- Moving provider factories out of extension modules may touch several packages. Mitigation: migrate only the first TUI-safe slices and classify the rest.
- Some useful capabilities depend on active editor state. Mitigation: keep them VSCode-only and show unavailable reasons in TUI.
- A hostless engine bridge may not exist yet. Mitigation: classify engine dispatch tools as unavailable until a non-VSCode bridge is introduced.
- Provider metadata may be incomplete. Mitigation: default legacy providers to VSCode-only unless they explicitly opt into TUI.
- More diagnostics may initially feel noisy. Mitigation: summarize in `/status` and put details behind `/capability show`.

## Final Scope Decisions

- `/capability` is the primary command family for capability diagnostics. `/tools` can remain focused on registered tool visibility if it already exists, but it should not own provider availability diagnostics.
- Reference contributor DTOs and requirement metadata belong in `@neko/shared` when they are package-neutral contracts. Runtime orchestration helpers belong in `@neko/agent`.
- First implementation uses explicit `cli-tui` registration for migrated TUI-safe provider factories. Package-export or manifest-driven auto-discovery is deferred until at least two packages prove the contract is stable.
- First implementation migrates `neko-assets` and `neko-story` as the proving slice. `neko-canvas` and `neko-audio` follow only after the loader, diagnostics, and reference contributor contract are validated.
- Legacy providers that do not declare `tui` or `cli` support are treated as VSCode-only.
