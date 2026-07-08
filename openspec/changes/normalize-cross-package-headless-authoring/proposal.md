## Why

Canvas has moved production `.nkc` authoring out of the Webview, but the same UI-bound durable-write pattern still exists in Cut, Sketch, Audio, Model, Assets dispatch, and Agent transfer flows. Host-originated operations such as "send generated result to editor", "import storyboard", "apply AI edit", or "create a project from selected media" should write durable `nk*` project facts through owning package services even when no editor Webview is open.

This fits the existing architecture by keeping project-file IO in Extension Host/domain services, reducing coupling by making Webviews projections instead of mutation executors, and improving extensibility/testing by giving VSCode, TUI, Electron, Agent, and future shortcuts the same typed authoring path.

## What Changes

- Introduce a cross-package headless authoring contract for durable `nk*` project mutations. The contract covers target resolution, create-new behavior, explicit document URI writes, optional reveal, diagnostics, and synchronization of already-open editors.
- Add or normalize package-owned authoring services for durable project writes:
  - Cut `.nkv`: generated clip import, storyboard/canvas draft import, media/source insertion, and create-new project flows.
  - Sketch `.nks`: image/layer/PSD import, AI result application, and save paths that no longer depend on a Webview snapshot as the only durable source.
  - Audio `.nka`: `documentUri`-based load/mutate/save for link/apply operations without requiring the project to already be open in the session cache.
  - Model `.nkm`: asset import and durable scene/project mutations without forcing an editor open; viewport/runtime controls remain explicit active-editor operations.
  - Puppet `.nkp`: keep current project-file path, but make runtime-only active puppet operations fail visibly and reserve headless service boundaries for future durable mutations.
- Update Assets import dispatch and Agent/plugin transfer planning to target canonical headless authoring commands/capabilities instead of old UI-bound commands.
- Define client-neutral authoring entry points that VSCode commands, TUI actions, Electron actions, Agent tools, and package APIs can share. VSCode Webview reveal/sync remains an adapter concern, not the authoring implementation.
- Keep Webviews responsible for rendering, focus, selection, viewport controls, interactive editing, and optional reveal/sync after a successful host-side write.
- Use shared content access, project-file IO, source/path policy, and generated asset promotion before persisting sources. Durable facts must use stable refs, workspace-relative paths, `${VAR}/path`, asset/entity IDs, or project-owned JSON data, not Webview URIs, cache paths, temp paths, Engine tokens, or blob URLs.
- **BREAKING** for unreleased internal command/API behavior: remove or fail-close default success paths where host/Agent durable writes post to an active Webview, open a hidden editor as a prerequisite, or report success when no project file was created/updated. UI-only wrapper commands may remain only when they call the canonical authoring service or explicitly declare an interactive-editor requirement.

### Non-Goals

- Do not make viewport playback, timeline scrubbing, selection, keyboard focus, camera controls, live preview, or other runtime interaction headless unless the operation also writes durable project facts.
- Do not create one generic mega authoring service that owns every domain model. Each package keeps its own authoring service and codec; shared code only covers common target/source/diagnostic contracts.
- Do not replace Rust Engine compute, media probe/decode, model runtime, or preview stream responsibilities.
- Do not introduce cloud, multi-user, remote service, CRDT, or distributed job architecture.
- Do not preserve old command aliases or compatibility fallbacks as default success paths inside the migrated boundary.

## Capabilities

### New Capabilities

- `cross-package-headless-authoring`: Defines host-side durable authoring behavior for `.nkv`, `.nks`, `.nka`, `.nkm`, and related transfer/import flows, including target resolution, create-new policy, UI reveal separation, open-editor synchronization, diagnostics, and legacy UI-bound path cleanup.

### Modified Capabilities

- None. This change consumes existing `project-file-io`, `cross-domain-content-access-runtime`, `editor-add-source-flows`, `generated-asset-lifecycle`, and `legacy-fallback-surface-elimination` requirements without changing their external behavior.

## Impact

- `packages/neko-cut`
  - Promote existing partial project session/headless paths into the canonical authoring service for generated clip, storyboard/canvas draft, source import, and create-new flows.
  - Remove Webview-active prerequisites for durable `.nkv` mutations.
- `packages/neko-sketch`
  - Add a host-side `.nks` authoring service for imports, AI edits, layer/document mutations, and save/reopen paths.
  - Stop treating Webview snapshots as the only source for host-originated durable saves.
- `packages/neko-audio`
  - Extend the session gateway/provider so `documentUri` operations can load, mutate, save, and reopen `.nka` projects without relying on an open editor cache.
- `packages/neko-model`
  - Route asset import and durable `.nkm` project mutations through a headless document path; keep runtime viewport tools active-editor-only with fail-visible diagnostics.
- `packages/neko-assets`
  - Dispatch imports to canonical package authoring commands/capabilities rather than old UI-bound import commands.
- `packages/neko-skills` and `packages/neko-agent`
  - Update transfer planners/capability descriptions so Agent selects package headless authoring for durable writes and reports diagnostics instead of assuming UI command success.
- Shared contracts and tests
  - Add minimal host-agnostic DTOs/diagnostics for authoring target resolution where cross-package callers need them.
  - Add canonical command/API naming guidance so migrated clients do not keep routing durable writes through old UI-bound command IDs.
  - Add path-level tests proving no active Webview is required and old UI-bound routes cannot return success for migrated durable authoring requests.
