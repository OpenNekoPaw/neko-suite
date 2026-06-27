## Context

`@neko/ui` already contains many useful primitives (`NumberInput`, `NumberSlider`, `ColorPicker`, `Select`, `Badge`, `Dialog`, `EmptyState`, `SegmentedControl`, keyframe visuals, toolbar/menu primitives), but fixed creative panels still fall into two extremes:

- Generic schema adapters, such as `neko-cut` `sharedPropertyAdapter.ts`, erase domain types into `PropertyDefinition[]` and later rebuild patches from string ids and runtime `typeof` checks.
- Package-local JSX and HTML inputs duplicate layout, slider, color, checkbox, row, and section behavior because `@neko/ui` does not yet expose enough layout-only composition primitives.

The architecture decision in `docs/architecture/adr-ui-domain-panels-and-shared-primitives.md` establishes the desired boundary: share visual primitives and interaction constraints, keep fixed domain panel structure in the owning package, and reserve generic `PropertyPanel` for truly dynamic schemas.

Current risks to address:

- `@neko/ui` has schema-bound `PropertyRow` / `PropertyGroup`, but no layout-only row/section primitives for fixed panels.
- `neko-cut` and `neko-sketch` fixed panels still use adapters with string id dispatch and empty-patch fallback.
- `@neko/ui` currently contains a few domain leaks: Agent menu defaults, domain prediction kinds, and keyframe timeline DTOs imported from `@neko/shared`.
- `neko-audio` is mostly typed and adapter-free, but still duplicates local range/row styling that should eventually be expressed through composition primitives.

Risk level: L2. This change affects shared React UI APIs and multiple Webview consumers, but does not change Engine, Proto, durable project files, Extension/Webview transport, or Rust runtime behavior.

## Goals / Non-Goals

**Goals:**

- Introduce a typed composition layer in `@neko/ui` for fixed creative panels.
- Preserve two-phase editing (`onPreviewChange` and `onCommit`) through composed rows, axis controls, sliders, numbers, colors, and selects.
- Refactor schema-bound `PropertyPanel` to reuse the same visual composition primitives while keeping its dynamic-schema role.
- Migrate representative fixed panels, especially `neko-cut` and `neko-sketch`, away from `PropertyDefinition` adapters when their fields are stable.
- Clean current `@neko/ui` domain leaks and add guardrails so new shared UI code does not embed feature-package semantics.
- Keep dynamic schema surfaces, such as Puppet runtime parameters and registry-driven parameter panels, on `PropertyPanel`.

**Non-Goals:**

- No redesign of domain workflows, store models, command protocols, or project formats.
- No migration of Agent Header/Input, model selector, session mode, or chat-specific surfaces into shared UI.
- No replacement of dynamic runtime parameter schemas with hard-coded composition.
- No requirement that all panels look identical or expose the same function set.
- No broad visual redesign or Webview runtime smoke for unrelated panels.

## Decisions

### Decision 1: Add a layout-only composition layer under `@neko/ui`

Create `@neko/ui` composition primitives that accept typed props, children, slots, and callbacks without accepting or returning `PropertyDefinition`:

- `PanelSection`: title, optional description, density, disabled state, collapsible affordance if needed, and child content.
- `PropertyRow`: label, description, disabled state, reset/keyframe/action slots, and arbitrary control children.
- `AxisGroup`: grouped numeric axes with per-axis labels, min/max/step/unit, two-phase callbacks, keyframe/reset affordances, and stable layout.
- `NumberPropertyRow`, `SliderPropertyRow`, `ColorPropertyRow`, `SelectPropertyRow`: convenience compositions over existing controls.
- Missing input primitives: `Checkbox`, `Switch`, and `Stepper` when needed by migrated panels.

Rationale: fixed panels need layout reuse without schema indirection. This layer avoids both large adapters and hand-written row duplication.

Alternatives rejected:

- Use `PropertyPanel` for every fixed panel: rejected because fixed fields lose type information and require reverse mapping.
- Write all fixed panels in raw JSX: rejected because layout, density, a11y, focus, preview/commit, and keyframe affordances drift.

### Decision 2: Preserve preview and commit as first-class contracts

Composition primitives MUST expose and pass through both preview and commit phases. Existing controls already distinguish live preview from final commit; composition must not collapse this into a single `onCommit`.

Rationale: sliders, color pickers, axis drags, and Engine/Webview previews need high-frequency preview updates while undo, command batching, and project mutation should happen on commit.

Alternatives rejected:

- Only expose `onCommit` in composite rows: rejected because it forces consumers to choose between sluggish previews and noisy commit paths.
- Make every composite row own debouncing/throttling policy: rejected because preview cadence differs by domain and Engine path.

### Decision 3: Keep `PropertyPanel`, but narrow its role

`PropertyPanel` remains the dynamic schema renderer for runtime/manifest/provider parameter lists. Its internal renderer should be rewritten to use the same `PanelSection`, `PropertyRow`, and `*PropertyRow` primitives as fixed panels.

Rationale: dynamic schemas are real contracts when fields are runtime data. The problem is not `PropertyPanel` existing; the problem is fixed panels generating temporary schemas to feed it.

Alternatives rejected:

- Delete `PropertyPanel`: rejected because Puppet/runtime/provider parameters need schema-driven rendering.
- Keep `PropertyPanel` as an independent monolithic renderer: rejected because fixed and dynamic panels would continue to diverge visually.

### Decision 4: Migrate fixed adapters by ownership, not by surface similarity

Fixed domain panels should move to typed composition in the owning package:

- `neko-cut`: transform/audio/text/style/defaults panels should stop mapping stable fields to `PropertyDefinition[]` and stop using string path patching for normal commits.
- `neko-sketch`: brush settings should move away from `sharedSketchUiAdapter` for fixed brush controls; layer tree projection may remain if `TreeViewItem` is the shared visual shell contract.
- `neko-audio`: keep typed panels; use new row/slider primitives to reduce local range/row duplication where behavior matches.
- `neko-model` / `neko-canvas`: use composition for stable transform fields; keep dynamic registry/runtime parameter surfaces on `PropertyPanel`.
- `neko-puppet`: keep runtime parameters schema-driven.

Rationale: the boundary is not “all panels shared” versus “all panels local”; it is fixed typed fields versus dynamic runtime fields.

Alternatives rejected:

- Migrate by component name alone, such as every “Transform” panel: rejected because some transforms are fixed UI while others may be runtime/engine schema.

### Decision 5: Clean `@neko/ui` domain leaks before broad adoption

Shared UI must not embed feature semantics:

- `context-menu-ai.ts`: either remove the Agent-specific helper from `@neko/ui` or make it a generic section builder requiring caller-provided labels/icons/actions.
- `prediction-layer.ts`: replace domain-specific `ViewportPredictionKind` literals with generic core kinds plus branded/custom domain strings.
- `keyframe-timeline.tsx`: keep visual timeline shell, but move minimal visual DTOs into `@neko/ui` and stop importing track-editing DTOs from `@neko/shared`.

Rationale: new composition primitives should not be built on a shared layer that already knows Agent, Puppet, Sketch, or Model semantics.

Alternatives rejected:

- Leave leaks as harmless constants: rejected because shared package APIs normalize feature semantics over time and invite more domain imports.

### Decision 6: Validate canonical paths, not just final UI behavior

Tests must prove migrated fixed panels no longer hit legacy adapter paths for normal commits. Where a legacy adapter remains temporarily, tests should poison or spy on it for migrated paths.

Rationale: result-only tests can pass while still using the old schema/adapter path, preserving the complexity this change is meant to remove.

Alternatives rejected:

- Only assert final store state after edits: rejected because it does not prove the canonical typed path is used.

## Five-Layer Analysis

Responsibility:

- `@neko/ui` owns visual primitives, layout, accessibility, focus metadata, theme integration, and composition APIs.
- Owning packages own domain fields, store selection, command dispatch, Engine/Webview message semantics, i18n labels, and fixed panel structure.
- Dynamic schema providers own canonical property definitions when fields are runtime data.

Dependency:

- `@neko/ui` may depend on React, DOM, and `@neko/shared` Layer 0 types only where they are UI-safe.
- `@neko/ui` must not import feature packages, VSCode APIs, Node APIs, Extension Host code, Engine clients, or feature package stores.
- Feature Webviews may import `@neko/ui` primitives and keep package-local wrappers when they carry domain semantics.

Interface:

- Composition APIs are props/callbacks/children based, not schema based.
- Fixed panel callbacks are typed by the owning package.
- Dynamic `PropertyPanel` keeps the `PropertyDefinition` contract.
- Keyframe visual DTOs should be UI-local and minimal; domain wrappers project store state into them.

Extension:

- The next fixed panel should add fields by adding typed rows in the owning component, not by adding schema mapping and reverse mapping.
- The next dynamic provider parameter list should use `PropertyPanel` and schema validation, not ad hoc JSX.
- New shared UI helpers must pass domain isolation guardrails before adoption.

Testing:

- `@neko/ui` unit tests for new primitives, two-phase callbacks, keyboard/focus metadata, disabled state, keyframe/reset slots, and theme classes.
- `PropertyPanel` tests proving it renders through the same composition primitives and preserves schema behavior.
- Package tests for `neko-cut` and `neko-sketch` migrated paths, including path-level assertions that normal edits bypass old adapters.
- Boundary checks proving `@neko/ui` does not embed Agent defaults, feature-package imports, or domain-specific prediction/keyframe DTOs.
- Focused Webview tests for migrated panels; VS Code Webview runtime smoke only for representative interaction paths if behavior or focus handling changes.

Proportionality:

- The new abstraction is a low-level UI composition layer, not a registry, provider system, or plugin platform.
- It is justified because multiple fixed panels need identical row/section/axis/keyframe affordances while retaining different domain functions.
- It avoids speculative generality by not modeling domain properties, commands, schemas, or stores.

Fail-visible behavior:

- Unknown fixed fields should fail at compile time or explicit switch/assertion points, not return `{}`.
- Dynamic schemas with unknown property kinds should fail visibly through `assertNever`, diagnostics, or tests.
- Migrated canonical paths should not silently fall back to legacy adapters.

## Risks / Trade-offs

- [Risk] New primitives become too broad and recreate `PropertyPanel` under another name. → Mitigation: keep APIs layout/slot/callback based and prohibit domain field schemas in composition primitives.
- [Risk] Migration touches many panels and becomes too large. → Mitigation: stage through `@neko/ui` primitives, `PropertyPanel` internal refactor, then targeted `neko-cut` and `neko-sketch` migrations with representative adoption elsewhere.
- [Risk] Visual regressions in dense editor panels. → Mitigation: add focused component tests and representative Webview runtime smoke where focus, layout, or keyframe interactions change.
- [Risk] Dynamic panels are accidentally rewritten as fixed JSX. → Mitigation: specs require dynamic runtime/provider schemas to stay on `PropertyPanel`.
- [Risk] Legacy adapters remain and hide broken new paths. → Mitigation: tests must assert canonical path usage and poison/spies on legacy adapter calls for migrated fixed paths.
- [Risk] Keyframe DTO cleanup breaks Model/Puppet/Cut wrappers. → Mitigation: use `ModelKeyframeTimeline` as the migration anchor and preserve wrapper structure: store projection → UI DTO → shared visual shell → typed callback.

## Migration Plan

1. Add `@neko/ui` composition primitive contracts and tests.
2. Refactor dynamic `PropertyPanel` internals to consume the composition primitives without changing dynamic schema behavior.
3. Clean `@neko/ui` domain leaks in menu, prediction, and keyframe DTO boundaries.
4. Migrate `neko-cut` fixed property sections to typed composition and delete or isolate migrated adapter paths.
5. Migrate `neko-sketch` brush controls to typed composition while preserving layer tree visual projection where appropriate.
6. Adopt primitives opportunistically in `neko-audio`, `neko-model`, or `neko-canvas` where it removes local row/range duplication without changing domain workflow.
7. Add boundary guardrails and validation commands.

Rollback strategy:

- Because this is prelaunch UI API cleanup, rollback means restoring the previous package-local panel code or shared export while keeping user project data unchanged.
- If a primitive API proves too narrow, add props/slots in `@neko/ui` before reintroducing package-local copies.
- Do not keep old adapter fallback as a default success path once a fixed panel migrates.

## Open Questions

- Should the first implementation expose both low-level `PropertyRow` and convenience `*PropertyRow` in the same PR, or stage convenience rows after `PropertyPanel` consumes the low-level primitives?
- Should `context-menu-ai.ts` be deleted entirely from `@neko/ui`, or converted to a neutral `buildMenuSection` helper with no Agent naming?
- Should `ViewportPredictionKind` become `string & { __brand?: 'ViewportPredictionKind' }` or a generic union plus `custom:${string}` convention?
- Which `neko-cut` sections should migrate first: transform/audio basics or style/defaults panels with broader local input duplication?
