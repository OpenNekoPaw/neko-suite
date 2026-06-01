## Context

`neko-model` has moved to Route A: the Webview shows Engine H.264 frames and dispatches semantic edits through scene-control. Recent LookDev work added contracts and UI for render modes, lights, environment, and typed picking, but product usability is still blocked when ordinary GLB/VRM assets cannot reliably complete the baseline loop:

1. Display the mesh clearly in the Engine stream.
2. Select an object or material target.
3. Edit Transform, LookDev, light, or background state.
4. Reconcile the UI from Engine acknowledgement, delta, snapshot, query result, or compatible frame metadata.

The current symptom is visible gray UI: LookDev often only exposes PBR; Object/Inspect can be disabled by missing semantic picking; Face/Bone tools are shown without enough character metadata; and controls do not consistently explain whether the block is Engine readiness, capability, selection context, or asset compatibility.

This design implements `docs/architecture/adr-neko-model-basic-editing-baseline.md`. It is a prerequisite for Headshot/AI asset conversion because generated assets are not useful if the user cannot inspect or edit them in the model editor.

Five-layer analysis:

- Responsibilities: Engine owns model loading, render stream, hit-test/query data, scene command application, revisions, and diagnostics. Webview owns controls, localized disabled reasons, pending UI, selection routing, and non-authoritative overlays. Extension Host stays limited to VSCode file/resource access and low-frequency entry points.
- Dependencies: The path runs from shared contracts and `@neko/neko-client` normalization into Engine scene-control/render viewport behavior, then into Webview store/controllers/components. It does not depend on AI providers.
- Interfaces: Reuse existing SceneCommand/SceneCommandAck/SceneSnapshot/SceneDelta/RenderStreamDescriptor contracts when possible. Add DTOs only if current contracts cannot represent disabled reasons, capability refresh, or baseline query diagnostics.
- Extension: B0-B2 ship first for ordinary GLB/VRM. B3 character tools stay gated by morph/bone/clip compatibility. B4 semantic regions and AI workflows remain later.
- Tests: Unit tests cover disabled reasons and gating. Contract tests cover capability and diagnostic normalization. Engine tests cover descriptor/capability, command ack/reject, and light/background behavior. E2E smoke covers a repository-owned GLB fixture.

## Goals / Non-Goals

**Goals:**

- Make ordinary GLB/VRM assets editable at the B0-B2 baseline: clear Engine stream, object/material selection, Transform editing, basic LookDev, authored light CRUD, and background/environment basics.
- Show structured localized reasons whenever a control is disabled or degraded.
- Allow Object and Inspect workflows without requiring advanced `typedPicking` or `.nkc` `characterRegions`.
- Treat Engine runtime ack/reject/query diagnostics as more authoritative than static capability discovery.
- Add a redistributable minimal GLB fixture for CI smoke tests.
- Preserve Route A: Webview remains a control surface and must not parse mesh/glTF/VRM for authority.

**Non-Goals:**

- Do not implement Headshot photo-to-3D, provider processing adapters, texture projection, or VLM verification.
- Do not make ordinary GLB assets pretend to support face regions, morph compatibility, or full character authoring.
- Do not introduce a Webview-side Three.js/R3F model renderer as visual truth.
- Do not redesign the Workbench Shell or revive a generic top viewport toolbar.

## Decisions

### Decision 1: Treat Basic Editing Baseline as the current P0

B0-B2 are required before further Headshot/AI implementation: visual stream, object selection, Transform, LookDev, lights, and background must work for ordinary assets. Character/semantic/AI editing remains capability-gated.

Alternative considered: continue from the Headshot/AI path and rely on future character contracts to unlock editing. Rejected because current usability issues affect ordinary GLB/VRM files and block every generated asset workflow.

### Decision 2: Disabled state is a first-class UI model

Webview will derive disabled/degraded reasons from scene-control status, Engine capability, selection context, asset metadata, and runtime diagnostics. Controls will use short localized tooltips/status text, with longer diagnostics routed to inspector/status surfaces.

Alternative considered: leave gray buttons as implicit state. Rejected because users cannot tell whether a feature is unavailable, still loading, unsupported by the current asset, or broken.

### Decision 3: Static capability is advisory; Engine responses are authoritative

Capability discovery controls the initial UI state, but runtime acknowledgements, rejections, query failures, and stream diagnostics update local availability. If Engine advertises a capability that fails at runtime, Webview downgrades and shows the diagnostic. If Engine succeeds despite conservative discovery, Webview may refresh capability or lift the local degraded state.

Alternative considered: trust capability discovery completely. Rejected because the current system already has partially implemented paths where advertised support and product behavior can diverge.

### Decision 4: Object/Inspect do not require semantic typed picking

Object and Inspect workflows must operate through Outliner selection and selected-node/material snapshots even if viewport hit-test or semantic picking is unavailable. Viewport click selection uses Engine hit-test where available, but Webview must not parse mesh data locally.

Alternative considered: disable all selection workflows when `typedPicking=false`. Rejected because it blocks the simplest object editing path and conflates semantic region picking with ordinary scene selection.

### Decision 5: Reuse and audit existing LookDev code

The existing LookDev/scene-control implementation likely covers much of B2, but this change treats it as implementation to audit, not proof of product readiness. We reuse passing paths and add diagnostics, fixture coverage, and visible-effect validation where gaps remain.

Alternative considered: rewrite LookDev controls under the new baseline. Rejected because it would duplicate working contract and Engine code and increase regression risk.

### Decision 6: 1080p/60fps is the default target with explicit fallback

The baseline target is 1080p/60fps. Low-end devices or host constraints may fall back to 720p, but fallback must be explicit in stream/capability diagnostics and the UI must not report a 720p stream as if it were 1080p.

Alternative considered: require hard 1080p on every host. Rejected because VSCode/Electron and device constraints can legitimately prevent it; the important product behavior is clarity and a non-silent fallback.

### Decision 7: CI uses a repository-owned fixture

Manual testing may continue to use `../neko-test/test.glb`, but automated tests must use a redistributable GLB fixture checked into the repo or generated by a test setup. The fixture must contain at least one mesh node, one material slot, non-empty bounds, and preferably a second node for Outliner selection.

Alternative considered: reference `../neko-test/test.glb` in tests. Rejected because it is outside the repository and cannot be assumed in CI.

## Risks / Trade-offs

- [Risk] Capability remains inaccurate after this change. -> Mitigation: reconcile UI from Engine ack/reject/query diagnostics and add tests for over-optimistic and over-conservative capability.
- [Risk] Diagnostics clutter the compact model UI. -> Mitigation: use short tooltip/status labels by default and route details to inspector/status panel.
- [Risk] Engine lacks node-level hit-test for viewport clicks. -> Mitigation: ship Outliner selection + Inspector first, then add or wire Engine hit-test fallback without Webview mesh parsing.
- [Risk] 1080p/60fps is unstable on some hosts. -> Mitigation: make fallback explicit, surface the reason, and keep visual editing usable at 720p.
- [Risk] Existing LookDev code passes contract tests but does not visually affect the model. -> Mitigation: add smoke tests and manual debugger checks that verify visible render/light/background changes.
- [Risk] Adding a binary GLB fixture increases repo size. -> Mitigation: use a minimal generated fixture with permissive license and keep it small.

## Migration Plan

1. Add disabled/degraded reason model, i18n strings, and UI surfaces.
2. Audit existing B0-B2 behavior against the ADR checklist and mark passing LookDev/light/environment paths as reused.
3. Add repository-owned GLB fixture and smoke harness.
4. Fix B0 stream/capability reporting and 1080p/720p diagnostics.
5. Fix B1 selection and Inspector fallback paths, adding Engine hit-test if needed.
6. Fix B2 command visibility: Transform, LookDev, light CRUD, and background/environment visible changes.
7. Gate B3 character tools with explicit asset compatibility reasons.

Rollback strategy: all UI enablement remains capability- and context-gated. If a subfeature fails, Webview can degrade that control with a diagnostic while keeping the PBR Engine stream and Outliner selection available.

## Open Questions

- Should the redistributable GLB fixture be checked in as a binary file or generated from a small source fixture during tests?
- Which surface should own detailed diagnostics long term: right inspector, status bar, or a dedicated viewport diagnostics panel?
- Should successful runtime commands automatically refresh capability discovery, or only clear the current control's degraded state?
