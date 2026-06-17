## Context

The current architecture already separates Scene and Character domains:

- `docs/domains/scene` defines `.nkm` as the truth for 2D Scene, 3D Scene, and Live Stage authoring.
- `docs/domains/character` defines `.nkp` as the truth for Live2D/Puppet character parameters, motions, expressions, physics, and tracking mappings.
- `packages/neko-model` owns the Route A scene viewport and authoring panels for Engine-backed scene control.
- `packages/neko-puppet` owns Live2D/MOC3 and native puppet runtime editing through `runtime-puppet`.

The remaining ambiguity is in implementation vocabulary and UI scope. Puppet Webview still has `PuppetSceneController`, `scene:puppet:*` actions, `sceneId` metadata, and native 2D skeleton editing affordances. Some of this is harmless shared viewport reuse, but it makes future product work easy to route incorrectly: generic 2D Scene creation could accidentally land in `neko-puppet` instead of `neko-model`.

This change is primarily an architecture and product-boundary cleanup. Implementation can be staged, but the canonical direction is:

```text
Scene domain
  .nkm profile: 2d | 3d | live
  owner: neko-model (+ neko-live for live operation)
  runtime: runtime-scene / future stage profile

Character domain
  .nkp profile: live2d | neko-puppet
  owner: neko-puppet
  runtime: runtime-puppet
```

## Goals / Non-Goals

**Goals:**

- Make `neko-model` the owner of 2D Scene authoring UX and `.nkm profile: 2d` project workflows.
- Keep `neko-puppet` focused on Live2D/Puppet character editing, not scene creation.
- Preserve useful shared viewport infrastructure without using Scene naming as a domain shortcut.
- Define contract and UI boundaries that prevent `.nkp` from storing stage camera, lights, tilemaps, scene switching, or generic scene graph truth.
- Provide a staged path for renaming local puppet viewport concepts and adding a puppet/character viewport domain if shared contracts require it.

**Non-Goals:**

- Do not move Live2D/MOC3 loading, parameter editing, motion playback, expression, physics, or tracking mapping into `neko-model`.
- Do not replace `runtime-puppet` with `runtime-scene`.
- Do not implement full 2D Scene authoring in this change; this change establishes ownership, routing, and cleanup tasks.
- Do not migrate valuable Live2D `.nkp` files to `.nkm`.
- Do not add a second Webview-local 2D renderer that bypasses Engine authority for durable Scene authoring.

## Five-Layer Analysis

### Responsibility

- `neko-model` owns Scene document lifecycle, `.nkm profile: 2d` routing, scene viewport state, scene graph authoring, camera/light/tilemap/sprite/parallax/particle editing, and scene command dispatch.
- `neko-puppet` owns `.nkp` document lifecycle, Live2D bundle/source import, puppet parameter values, expressions, motions, physics, tracking mappings, and native puppet rig editing.
- `neko-engine` owns `runtime-scene` and `runtime-puppet` runtime state. Scene and Puppet runtimes may both render 2D pixels, but they represent different authoring truths.
- `@neko/ui` may continue to provide a generic viewport shell, overlay renderer, layout primitives, and creative controls. It must not own Scene or Puppet business logic.

### Dependency

- Layer 0 contracts belong in `packages/neko-types`, `packages/neko-proto`, and `packages/neko-client`.
- `neko-model` and `neko-puppet` must not directly import each other's implementation packages.
- Cross-domain links use stable refs:
  - `.nkm profile: live` may reference `.nkp` actors.
  - `.nkm profile: 2d` may reference image assets and character assets, but it does not copy `.nkp` parameter truth.
  - `.nkp` may reference source model/bundle assets, but it does not save `.nkm` scene graph state.
- Webviews remain sandboxed. Extension Hosts keep VSCode API, file access, resource authorization, and Engine endpoint discovery.

### Interface

- `.nkm` profile fields are the public project-file boundary for 2D Scene authoring.
- `.nkp` profile fields are the public project-file boundary for Live2D/Puppet authoring.
- If viewport command/event contracts need domain-level clarity, add `ViewportDomain` values such as `puppet` or `character` before changing feature code. Avoid continuing to encode puppet authoring as `domain: 'scene'` plus `scene:puppet:*` actions.
- If shared viewport DTOs retain `sceneId` for compatibility, Puppet code should wrap it in local naming such as `puppetId`, `viewportSubjectId`, or `documentId` at the package boundary so internal code does not imply Scene ownership.
- Agent capability and package metadata must advertise Scene creation through `neko-model`, and Live2D/Puppet character operations through `neko-puppet`.

### Extension

- Future 2D Scene features such as sprite layout, tilemaps, 2D lights, camera rigs, parallax, and particles can be added under `.nkm profile: 2d` without editing Puppet internals.
- Future Puppet features such as Live2D expressions, motion blending, physics tuning, lip-sync, tracking presets, and native BlendShape/bone editing can be added under `.nkp` without carrying Scene authoring concepts.
- Shared viewport shell evolution should move toward subject-neutral names where possible (`viewport`, `subject`, `document`, `frameMeta`) so Model, Puppet, Preview, and Live can reuse it without adopting each other's domain language.

### Testing

- Contract tests should validate that `.nkm profile: 2d` accepts Scene fields and `.nkp` rejects or ignores generic Scene authoring fields.
- Webview tests should prove `neko-puppet` does not show generic Scene creation affordances while Live2D/Puppet workflows remain visible.
- `neko-model` tests should cover routing/opening of `.nkm profile: 2d` documents and command dispatch through Scene/Viewport paths.
- Boundary checks should confirm Webview/Extension layering and absence of direct feature-package coupling.
- VSCode Webview runtime smoke is required once UI routing or visual/interaction behavior changes.

## Decisions

### Decision 1: 2D Scene authoring belongs to `.nkm` and `neko-model`

`neko-model` is the Scene authoring package even when the scene profile is 2D. This keeps scene graph, camera, light, actor, live stage, and viewport command semantics in one domain.

Rejected alternative: keep 2D Scene authoring in `neko-puppet` because it already renders 2D meshes. That confuses pixels with authoring truth and would split Scene workflows across two editors.

### Decision 2: Live2D remains `.nkp` and `neko-puppet`

Live2D/MOC3 import, parameter sliders, expressions, motions, physics, and tracking mappings are Character/Puppet facts. They remain in `neko-puppet` and `runtime-puppet`.

Rejected alternative: move Live2D into `neko-model` because Live2D can appear in a stage. A stage references actors; it does not own actor parameter definitions or motion libraries.

### Decision 3: Shared viewport reuse is allowed, Scene naming debt is not

`ViewportShell`, overlays, prediction layers, and local pointer/keyboard plumbing can remain shared UI infrastructure. The cleanup target is domain vocabulary and action contracts, not the reusable viewport surface itself.

Rejected alternative: fork a Puppet-specific viewport shell immediately. That would reduce naming ambiguity but create duplicate pointer, overlay, context-menu, and toolbar behavior before the shared API is proven insufficient.

### Decision 4: Prelaunch drafts can break when they used the wrong domain

Unreleased `.nkp` drafts that represented generic 2D scenes should not receive long-lived compatibility shims. They should fail with a clear diagnostic or be recreated as `.nkm profile: 2d`.

Rejected alternative: preserve `.nkp` as a compatibility scene format. That would permanently encode the wrong domain boundary.

### Decision 5: Keep shared viewport domains unchanged in this slice

This change does not add a new shared `ViewportDomain` value yet. Existing shared viewport wire fields may keep scene-oriented compatibility names while `neko-puppet` isolates them behind local Puppet/Character viewport adapters and naming. A future shared protocol cleanup can introduce `puppet` or `character` once both Model and Puppet call sites are ready to migrate together.

Rejected alternative: expand the shared viewport protocol immediately. That would turn a Scene/Character ownership cleanup into a cross-package protocol migration before the package-local Puppet naming debt is contained.

## Risks / Trade-offs

- Existing tests may depend on `scene:puppet:*` action names -> Update tests together with contract changes, or add a short-lived adapter with owner/removal criteria if broad shared changes would block progress.
- Shared viewport protocol may still require `sceneId` -> Keep wire compatibility initially, but isolate naming behind Puppet-local adapters and track shared protocol rename separately if needed.
- Moving 2D Scene entry points to `neko-model` may expose incomplete 2D UI -> Gate unfinished profile panels behind clear unavailable/degraded states rather than silently routing users to Puppet.
- Users with experimental `.nkp` 2D scene drafts may lose direct open behavior -> Provide diagnostics explaining that generic 2D scenes now belong in `.nkm profile: 2d`.
- `neko-model` README is currently 3D Route A heavy -> Update docs to say Route A applies to Engine Scene viewport while `.nkm profile: 2d` is also a Scene authoring profile.

## Migration Plan

1. Update docs and package boundaries to make `neko-model` the owner of 2D Scene authoring and `neko-puppet` the owner of Live2D/Puppet character authoring.
2. Audit Puppet Webview for generic Scene affordances and remove, hide, or rename them.
3. Add or verify `.nkm profile: 2d` routing in `neko-model` with clear unavailable states for unimplemented panels.
4. Introduce puppet/character viewport domain naming where contract changes are justified; otherwise isolate existing `sceneId` wire names behind local adapters.
5. Add tests and validation commands for contracts, Webview UI, package boundaries, and VSCode runtime smoke.

Rollback strategy: if `neko-model` 2D profile routing regresses, keep `.nkm profile: 2d` documents loadable with an explicit "2D Scene authoring unavailable" state. Do not route generic 2D Scene editing back to `neko-puppet`.

## Open Questions

- Should the shared viewport protocol use `domain: 'puppet'` or a broader `domain: 'character'`?
- Should native Neko Puppet bone/BlendShape rig editing remain in the same Puppet Webview mode as Live2D, or become a separate `.nkp profile: neko-puppet` mode with explicit UI switching?
- What is the minimum acceptable first slice for `.nkm profile: 2d`: document routing only, sprite layout, or sprite plus camera preview?
