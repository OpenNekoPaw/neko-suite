## Context

`neko-model` has moved to Route A: the Webview shows Engine H.264 frames and dispatches semantic edits through scene-control. Recent LookDev work added contracts and UI for render modes, lights, environment, and typed picking, but product usability is still blocked when ordinary GLB/VRM assets cannot reliably complete the baseline loop:

1. Display the mesh clearly in the Engine stream.
2. Select an object or material target.
3. Edit Transform, LookDev, light, or background state.
4. Reconcile the UI from Engine acknowledgement, delta, snapshot, query result, or compatible frame metadata.

The current symptom is visible gray UI: LookDev often only exposes PBR; Object/Inspect can be disabled by missing semantic picking; Face/Bone tools are shown without enough character metadata; and controls do not consistently explain whether the block is Engine readiness, capability, selection context, or asset compatibility.

The first implementation attempt also exposed a separate performance bug: added control-flow paths can accidentally couple camera/drag feedback to SceneControl ACKs, H.264 stream restarts, or WebCodecs queue manipulation. This design therefore treats immediate local feedback and latest-only Engine hot updates as a hard constraint, not an optimization.

This design implements `docs/architecture/adr-neko-model-basic-editing-baseline.md`. It is a prerequisite for Headshot/AI asset conversion because generated assets are not useful if the user cannot inspect or edit them in the model editor.

Five-layer analysis:

- Responsibilities: Engine owns model loading, render stream, hit-test/query data, scene command application, revisions, runtime stream profile, and diagnostics. Webview owns controls, localized disabled reasons, pending UI, selection routing, local intent/prediction, and non-authoritative overlays. Extension Host stays limited to VSCode file/resource access and low-frequency entry points.
- Dependencies: The path runs from shared contracts and `@neko/neko-client` normalization into Engine scene-control/render viewport behavior, then into Webview store/controllers/components. It does not depend on AI providers.
- Interfaces: Reuse existing SceneCommand/SceneCommandAck/SceneSnapshot/SceneDelta/RenderStreamDescriptor contracts when possible. Add DTOs only if current contracts cannot represent disabled reasons, capability refresh, runtime stream diagnostics, or baseline query diagnostics.
- Extension: B0-B2 ship first for ordinary GLB/VRM. B3 character tools stay gated by morph/bone/clip compatibility. B4 semantic regions and AI workflows remain later.
- Tests: Unit tests cover disabled reasons and gating. Contract tests cover capability and diagnostic normalization. Engine tests cover descriptor/capability, command ack/reject, light/background behavior, and runtime stream profile behavior. E2E smoke covers a repository-owned GLB fixture.

## System Shape

The baseline editor has three independent loops that must not be collapsed into one another:

| Loop | Examples | Feedback owner | Authority owner | Latency rule |
|---|---|---|---|---|
| Hot interaction loop | camera orbit, wheel, keyboard camera, transform drag preview, light drag preview, continuous slider preview | Webview local intent / overlay prediction | Engine latest state after hot update | Immediate; no ACK gating |
| Reliable authoring loop | transform commit, light add/update/delete, background/environment commit, low-frequency LookDev descriptor change | Webview pending/applied/rejected state | Engine ack/reject + SceneDelta/snapshot/frame metadata | Can wait for final consistency |
| Visual stream loop | H.264 frames, render metadata, resolution/fps diagnostics, decode/presentation stats | Engine stream + Webview decode diagnostics | Engine render output | Must not be restarted for hot interaction |

The previous regression came from mixing these loops: camera hot interaction was effectively coupled to ACK/reconfigure/decode behavior. This design makes the separation explicit.

### Control Flow

Hot interaction path:

```text
pointer/wheel/key input
  -> Viewport controller updates local intent immediately
  -> send latest-only scene-control hot update
       { viewportId, camera/drag/slider state, streamProfile: 'interactive', profileTtlMs }
  -> existing H264StreamClient updates backpressure policy only
  -> Engine applies latest hot state and active stream runtime profile
  -> SceneDelta/snapshot/frame metadata later reconciles final state
```

Reliable commit path:

```text
commit command
  -> SceneCommand envelope with seq/correlationId/baseRevision
  -> Engine ack/reject
  -> SceneDelta/snapshot/frame metadata confirms applied revision
  -> Webview marks pending/applied/rejected and clears prediction
```

## State Model

### Disabled / Degraded Reasons

Use a small typed availability model instead of boolean `disabled` props:

```typescript
type ModelControlAvailability =
  | { state: 'available' }
  | { state: 'pending'; reason: ModelControlReason }
  | { state: 'disabled'; reason: ModelControlReason }
  | { state: 'degraded'; reason: ModelControlReason; retryable: boolean };

type ModelControlReason =
  | 'engine-not-ready'
  | 'scene-control-disconnected'
  | 'capability-unsupported'
  | 'capability-unknown'
  | 'no-selection'
  | 'asset-not-character'
  | 'missing-morph-data'
  | 'missing-bone-data'
  | 'missing-animation-clips'
  | 'hit-test-unavailable'
  | 'runtime-rejected'
  | 'stream-fallback'
  | 'metadata-stale';
```

The exact type names may differ, but the implementation must keep these properties:

- reasons are structured, not plain display strings;
- reasons map to Chinese and English strings;
- runtime Engine diagnostics can override stale static capability assumptions;
- a higher-level character downgrade must not disable Object, Inspect, Transform, LookDev, light, or background controls.

### Capability Reconciliation

Availability derives from this precedence order:

1. Runtime Engine rejection/query diagnostic for the current control.
2. Scene-control connection and scene readiness.
3. Current selection and asset compatibility.
4. Effective stream/descriptor diagnostics.
5. Static Engine capability discovery.
6. Conservative unknown fallback.

Static capability is never the final truth. It seeds the UI, then runtime responses refine it.

## Baseline Flows

### B0: Visual Stream And Camera

- Webview requests stream dimensions from CSS viewport size multiplied by `devicePixelRatio`, subject to Engine/device caps.
- Effective coded size, target FPS, DPR, canvas CSS size, canvas physical size, presentation scale, codec, GOP, bitrate, decode lag, presentation FPS, and fallback reason are exposed in diagnostics.
- Camera orbit/pan/zoom is handled as hot interaction. It must not call `startSceneRenderStream()` after the initial descriptor is active.
- If the host presentation cadence is below 60Hz, diagnostics should identify presentation/host cadence separately from Engine render or encode time.

### B1: Object And Inspect

- Outliner selection is the minimum viable object selection path.
- Viewport click selection uses Engine hit-test/query when available.
- If Engine hit-test is unavailable, Webview shows `hit-test-unavailable` but keeps Outliner selection and Inspector editing.
- Inspect uses SceneSnapshot/query data. It must not parse source GLB/VRM files in Webview.
- MaterialSlot/submesh inspection can be read-only until Engine exposes reliable write commands.

### B2: Transform, LookDev, Light, Background

- Transform numeric commit is a reliable SceneCommand with `seq`, `correlationId`, and `baseRevision`.
- Transform drag preview is a hot update; final drop/commit reconciles through reliable command or Engine-applied revision.
- LookDev mode switching can use descriptor restart only for low-frequency mode changes; it must keep the last frame and pending/timeout/rollback UI.
- Light add/delete/update/background/environment edits must produce SceneDelta/snapshot or equivalent confirmation and visible Engine output change.
- Light position dragging follows the same hot-preview/final-commit split as transform.

## Performance And Diagnostics

Performance UI must help answer "where is the delay?" rather than reporting a single FPS:

| Category | Required signal |
|---|---|
| Engine | render/frame time, post-process/helper passes when available |
| Encoder/stream | coded size, bitrate, GOP, codec/profile, encode latency |
| WebCodecs | decode FPS, pending decode frames, decode output lag, dropped/backpressure frames |
| Presentation | canvas CSS/physical size, DPR, presentation scale, presentation FPS |
| Control | scene-control connected/ready, latest ACK age, rejected/degraded reason |
| Metadata | frame metadata delay, stale revision/appliedSeq, ack-before-frame |
| Memory | JS heap if available; GPU/VideoToolbox memory only if measured or clearly marked unavailable/estimated |

The performance overlay itself must not become part of the problem:

- overlay panels can be selectable and interactive;
- non-panel overlay regions must not steal pointer capture from viewport controls;
- avoid continuous heavy composition effects such as `backdrop-filter` on the hot viewport surface.

## Goals / Non-Goals

**Goals:**

- Make ordinary GLB/VRM assets editable at the B0-B2 baseline: clear Engine stream, object/material selection, Transform editing, basic LookDev, authored light CRUD, and background/environment basics.
- Show structured localized reasons whenever a control is disabled or degraded.
- Allow Object and Inspect workflows without requiring advanced `typedPicking` or `.nkc` `characterRegions`.
- Treat Engine runtime ack/reject/query diagnostics as more authoritative than static capability discovery.
- Preserve the high-frequency interaction hot path: local intent updates first; Engine receives latest-only hot updates without ACK gating; video/frame metadata reconciles final state later.
- Add a redistributable minimal GLB fixture for CI smoke tests.
- Preserve Route A: Webview remains a control surface and must not parse mesh/glTF/VRM for authority.

**Non-Goals:**

- Do not implement Headshot photo-to-3D, provider processing adapters, texture projection, or VLM verification.
- Do not make ordinary GLB assets pretend to support face regions, morph compatibility, or full character authoring.
- Do not introduce a Webview-side Three.js/R3F model renderer as visual truth.
- Do not redesign the Workbench Shell or revive a generic top viewport toolbar.
- Do not use WebCodecs reset/close/recreate or suppression of already submitted hardware decode frames as a latency strategy.

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

The baseline target is 1080p/60fps. Low-end devices, display refresh, VSCode/Electron Webview presentation, or codec constraints may fall back to lower effective presentation rates or 720p, but fallback must be explicit in stream/capability diagnostics and the UI must not report a fallback stream as if it were 1080p.

Alternative considered: require hard 1080p on every host. Rejected because host constraints can legitimately prevent it; the important product behavior is clarity and a non-silent fallback.

### Decision 7: CI uses a repository-owned fixture

Manual testing may continue to use `../neko-test/test.glb`, but automated tests must use a redistributable GLB fixture checked into the repo or generated by a test setup. The fixture must contain at least one mesh node, one material slot, non-empty bounds, and preferably a second node for Outliner selection.

Alternative considered: reference `../neko-test/test.glb` in tests. Rejected because it is outside the repository and cannot be assumed in CI.

### Decision 8: High-frequency interaction is not an authoring ACK path

Camera orbit, viewport drag, light drag, transform drag, wheel, keyboard camera actions, and continuous sliders must first update local intent/prediction and then send latest-only hot updates to Engine. They must not wait for `viewportCameraAck`, must not restart H.264 streams, and must not reset WebCodecs or suppress frames already submitted to hardware decode.

Alternative considered: treat every interaction as a reliable scene command with ACK before visible feedback. Rejected because it caused seconds of perceived latency and split control-flow truth from video output timing.

### Decision 9: Fixture documentation is not fixture completion

The restored `test-fixtures/model/README.md` only defines fixture requirements. It does not close the fixture implementation task. The implementation must still add either a redistributable binary GLB or a deterministic generator usable by CI.

Alternative considered: mark the fixture task complete because the requirement is documented. Rejected because smoke tests need an actual file or generator.

### Decision 10: Visual verification is required for B2

LookDev, light, and background commands are not considered complete if tests only prove acknowledgements or state mutation. At least one smoke path must verify visible Engine output changes for the repository fixture.

Alternative considered: rely on contract tests and frame metadata only. Rejected because the reported product issue is "buttons exist but nothing visible happens."

## Risks / Trade-offs

- [Risk] Capability remains inaccurate after this change. -> Mitigation: reconcile UI from Engine ack/reject/query diagnostics and add tests for over-optimistic and over-conservative capability.
- [Risk] Diagnostics clutter the compact model UI. -> Mitigation: use short tooltip/status labels by default and route details to inspector/status panel.
- [Risk] Engine lacks node-level hit-test for viewport clicks. -> Mitigation: ship Outliner selection + Inspector first, then add or wire Engine hit-test fallback without Webview mesh parsing.
- [Risk] 1080p/60fps is unstable on some hosts. -> Mitigation: make fallback explicit, surface the reason, and keep visual editing usable at 720p.
- [Risk] Existing LookDev code passes contract tests but does not visually affect the model. -> Mitigation: add smoke tests and manual debugger checks that verify visible render/light/background changes.
- [Risk] Adding a binary GLB fixture increases repo size. -> Mitigation: use a minimal generated fixture with permissive license and keep it small.
- [Risk] Hot-path code regresses into ACK-gated or stream-restart behavior. -> Mitigation: add Route A boundary tests and checklist items for no ACK gating, no stream restart, no decoder reset, and no submitted-frame suppression.

## Migration Plan

1. Add disabled/degraded reason model, i18n strings, and UI surfaces.
2. Audit existing B0-B2 behavior against the ADR checklist and mark passing LookDev/light/environment paths as reused.
3. Add repository-owned GLB fixture and smoke harness.
4. Fix B0 stream/capability reporting and 1080p/720p diagnostics.
5. Fix hot-path camera/drag/slider behavior before widening any control UI: local feedback first, latest-only Engine hot updates, asynchronous reconciliation.
6. Fix B1 selection and Inspector fallback paths, adding Engine hit-test if needed.
7. Fix B2 command visibility: Transform, LookDev, light CRUD, and background/environment visible changes.
8. Gate B3 character tools with explicit asset compatibility reasons.

Rollback strategy: all UI enablement remains capability- and context-gated. If a subfeature fails, Webview can degrade that control with a diagnostic while keeping the PBR Engine stream and Outliner selection available. If hot-path latency regresses, rollback the new control-flow path before rolling back unrelated B0-B2 diagnostics.

## Validation Plan

- Webview unit: availability derivation, i18n reason mapping, Object/Inspect without semantic picking, character downgrade independence, hot-path no ACK-gating state.
- Webview boundary: no Three.js/R3F/glTF parser, no Extension Host high-frequency route, no stream lifecycle dependency on `streamProfile`.
- Client unit: capability normalizers, scene-control runtime diagnostic precedence, `H264StreamClient` policy update without decoder reset.
- Engine/Rust: effective descriptor diagnostics, runtime interaction profile TTL, render mode capability, light/background command diagnostics, SceneDelta/snapshot reconciliation.
- Smoke/manual: repository fixture and local `../neko-test/test.glb` in VSCode extension debugger; frequent camera/drag operations; visible LookDev/light/background changes; performance overlay confirms delay category.

## Open Questions

- Should the redistributable GLB fixture be checked in as a binary file or generated from a small source fixture during tests?
- Which surface should own detailed diagnostics long term: right inspector, status bar, or a dedicated viewport diagnostics panel? Short reasons must still be visible at the disabled control.
- Should successful runtime commands automatically refresh capability discovery, or only clear the current control's degraded state? Initial implementation can clear local degraded state and defer global refresh.
