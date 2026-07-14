## 1. Shared Contract And Audit Guards

- [x] 1.1 Add shared authoring target/result/diagnostic DTOs for `active`, `file`, and `new` targets, optional reveal, written document URI, created flag, and machine-readable diagnostics.
- [x] 1.2 Add shared test helpers or poison utilities that let package tests assert old Webview executors, command IDs, or message paths are not used.
- [x] 1.3 Add static guard coverage for migrated production code so old durable-write paths cannot keep returning success through active Webview mutation.
- [x] 1.4 Document the operation classification vocabulary: `document-authoring`, `interactive-editor`, and `projection-only`.
- [x] 1.5 Define canonical authoring command/API naming guidance and mark old UI-bound command IDs as removed, UI-only wrappers, or fail-closed migration diagnostics.
- [x] 1.6 Add client-neutral adapter tests or fixtures proving VSCode, TUI, and Electron callers can target the same package authoring contract without Webview dependencies.

## 2. Cut Headless Authoring

- [x] 2.1 Define `CutProjectAuthoringService` or a canonical authoring facade over the existing project session path for `.nkv` load/create/mutate/save.
- [x] 2.2 Migrate generated clip import to the Cut authoring service with explicit target, create-new policy, source normalization, and optional reveal.
- [x] 2.3 Migrate storyboard/canvas draft import flows to the Cut authoring service and return created timeline refs plus written document URI.
- [x] 2.4 Migrate source insertion/add-media command paths so durable `.nkv` writes do not require an active Webview.
- [x] 2.5 Add Cut no-active-Webview tests for explicit document target, create-new target, save/reopen, and poisoned old Webview command paths.

## 3. Sketch Headless Authoring

- [x] 3.1 Define `SketchProjectAuthoringService` for `.nks` load/create/mutate/save and package-owned layer/document edit planning.
- [x] 3.2 Migrate image/PSD/source import into `.nks` so host-originated imports can add durable layer/document facts without an active sketch Webview.
- [x] 3.3 Migrate generated image insertion or AI result application where stable source/mask/layer inputs are available.
- [x] 3.4 Keep active-selection tools such as selection inpaint, active canvas snapshot, and mask capture explicitly interactive-editor with typed diagnostics when no active editor exists.
- [x] 3.5 Replace Webview-snapshot-only save assumptions for host-originated writes with provider/session state that can save and reopen without Webview memory.
- [x] 3.6 Add Sketch tests for no-active-Webview import, AI result insertion where supported, runtime-handle rejection, save/reopen, and poisoned active Webview import paths.

## 4. Audio Document-URI Authoring

- [x] 4.1 Upgrade the Audio project session gateway/provider so `documentUri` can load `.nka` project data from disk when it is not already open in the editor cache.
- [x] 4.2 Route `linkAudioSource` and project edit operations through the upgraded gateway with save and open-panel sync.
- [x] 4.3 Preserve playback, recording, stream, seek, and waveform UI operations as interactive/runtime paths with typed active-editor or stream diagnostics.
- [x] 4.4 Add Audio tests for unopened `documentUri` load/edit/save, save/reopen, open-panel sync, and no fallback to active panel cache.

## 5. Model Durable Authoring

- [x] 5.1 Define `ModelProjectAuthoringService` over `ModelDocument`/`.nkm` codec utilities for durable asset import and project fact updates.
- [x] 5.2 Migrate `neko.model.importAsset` or its replacement canonical command so importing a model asset into `.nkm` can run without opening the Model editor first.
- [x] 5.3 Keep Engine scene query/mutate, viewport, animation playback, and live runtime tools active-editor/runtime-bound with fail-visible diagnostics.
- [x] 5.4 Add Model tests for no-active-Webview asset import, explicit document target, create-new target, save/reopen, and poisoned open-editor import path.

## 6. Assets, Agent, And Skills Routing

- [x] 6.1 Update `neko-assets` import dispatch to call canonical package authoring commands/capabilities for migrated durable imports.
- [x] 6.2 Update `neko-skills` plugin-transfer planner to stop emitting old UI-bound command IDs for Cut, Sketch, and Model durable transfers.
- [x] 6.3 Update Agent plugin transfer bridge tests and implementation to pass target/reveal/source/provenance to canonical authoring capabilities and report diagnostics.
- [x] 6.4 Update relevant Skill/capability text so Agent understands which operations are durable authoring versus interactive-editor operations.
- [x] 6.5 Add transfer planner tests proving old command IDs are absent and canonical authoring capabilities are selected.

## 7. Client Adapters

- [x] 7.1 Add or update VSCode command adapters so migrated durable commands call package authoring services first and reveal/sync only after successful writes.
- [x] 7.2 Add or update TUI host action adapters to call the same package authoring services or typed APIs without VSCode/Webview assumptions.
- [x] 7.3 Add or update Electron host action adapters to call the same package authoring services or typed APIs while keeping native window reveal separate.
- [x] 7.4 Add adapter boundary tests proving core authoring services do not import VSCode window APIs, Webview panels, React, DOM, terminal UI, or Electron window state.

## 8. Puppet, Story, And Boundary Cleanup

- [x] 8.1 Audit Puppet `.nkp` durable mutation paths and add typed diagnostics for runtime-only active puppet operations when no active runtime exists.
- [x] 8.2 Audit Story document/index operations and narrow any overly broad active-editor requirement that can be served by headless read/index behavior.
- [x] 8.3 Record any remaining package-local active-editor dependency as interactive-editor only, with owner, reason, and validation coverage.

## 9. Legacy Path Removal

- [x] 9.1 Remove or fail-close migrated Webview-only durable write messages and hidden open-editor prerequisites in Cut.
- [x] 9.2 Remove or fail-close migrated Webview-only durable write messages and active editor import prerequisites in Sketch.
- [x] 9.3 Remove or fail-close migrated open-cache-only project edit assumptions in Audio.
- [x] 9.4 Remove or fail-close migrated temp-project/open-editor import prerequisites in Model.
- [x] 9.5 Run targeted legacy/static scans for old command IDs, Webview executor paths, runtime handle persistence, and compatibility fallback terms.

## 10. Documentation And Validation

- [x] 10.1 Update affected package architecture docs to state that durable authoring goes through package authoring services and Webviews are projections/interactive editors.
- [x] 10.2 Update Agent/transfer documentation to describe canonical authoring capabilities and fail-visible diagnostics.
- [x] 10.3 Update TUI/Electron architecture notes or package docs to describe shared authoring adapter responsibilities.
- [x] 10.4 Run focused shared contract tests and package tests for each migrated package as tasks land.
- [x] 10.5 Run package compile/typecheck for migrated packages and any affected shared packages.
- [x] 10.6 Run a real VS Code Webview functional scenario for reveal/sync behavior after host-side writes, or record a blocking condition plus residual risk if unavailable.
- [x] 10.7 Run `pnpm check:legacy-debt` and `pnpm check:unused`, or record which broader quality command covered those checks and any unrelated existing failures.

## Validation Notes

- `pnpm exec turbo run compile --filter=neko-cut --filter=neko-sketch --filter=neko-audio --filter=neko-model --filter=neko-assets --filter=neko-agent` passed on 2026-07-08.
- Focused Vitest suites for shared authoring contracts, plugin transfer, Agent bridge, Assets dispatch, Cut, Sketch, Audio, Model, Puppet, and Story passed on 2026-07-08.
- A VS Code Webview functional scenario was not run because this cleanup changed host-side authoring routes, command registration, tests, and docs, not Webview interaction rendering. Residual risk: reveal/sync behavior after successful host writes is covered by unit tests and compile, but not by Extension Development Host functional evidence in this pass.
- `pnpm check:legacy-debt` ran and failed on existing repository-wide debt classes (`migrate-now` in Agent/Canvas and `needs-review` in Canvas/Desktop). The migrated authoring production scan for old Cut/Sketch/Model command IDs, queued imports, temp projects, and old Webview import messages was empty.
- `pnpm check:unused` ran and failed on existing repository-wide unused dependencies/exports and package entry hints outside this change boundary.
