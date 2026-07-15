## Context

The accepted Board convention already makes `neko/boards/*.nkc` ordinary Canvas documents and gives Agent a deterministic target. It also made completed generated media durable under `neko/generated/<kind>/` before optionally registering it in AssetLibrary. The new product direction keeps the Board routing but removes that second retention surface: generated candidates are reviewable in Canvas without becoming project facts, and explicit Save to Assets is the only new durable retention path.

Canvas already has most of the structural foundations:

- `CanvasNode.parentId` expresses organization membership while `position` remains an absolute Canvas coordinate.
- Group uses the existing container capability with `layout.mode = manual`, accepts foundational nodes, and can nest containers.
- moving a container already translates its descendant subtree by a delta;
- node-card policy/dispatch code already owns type-specific actions;
- AssetLibrary owns curated `AssetEntity`/variant/file facts, while ResourceCache and generated-output records own unpromoted runtime resolution.

The current rendering path conflicts with the desired experience. It filters every node with a `parentId` from the main node layer and renders Group children as summary rows. All `BaseNode` instances also receive the global macOS-card border, background, and shadow. Generated Board delivery writes media through Canvas authoring as soon as the task completes, so there is no runtime review-group boundary before persistence.

This change crosses Layer 0 Canvas/promotion contracts, Canvas Extension orchestration, Canvas Webview presentation and interaction, Agent task delivery, AssetLibrary ingest, and generated-output retention. Webview remains unable to read files or call VS Code directly; all promotion, path, persistence, and lifecycle mutations remain Host-owned.

## Goals / Non-Goals

**Goals:**

- Make foundational Canvas nodes content-first and low-chrome while preserving visible selection, focus, editing, loading, and error states.
- Render manual Group containers as semi-transparent spatial regions containing their real child nodes.
- Preserve one canonical absolute coordinate model and deterministic nested membership.
- Allow explicit ordering/auto-arrange without continuously overwriting creator placement.
- Present generated candidates as an unsaved runtime group and promote one or many candidates through AssetLibrary/AssetStore before durable Board authoring.
- Keep promotion, Board apply, retries, partial failure, and legacy generated-source handling explicit and idempotent.
- Preserve existing valuable `neko/generated/<kind>/` data while preventing new canonical producers from writing there.

**Non-Goals:**

- Introduce a Board file type, Draft profile, Basic node union, `.nkdraft`, alternate `.nkc` schema, or persisted Basic renderer flag.
- Turn Scene, Shot, Gallery, Table, Storyboard, Timeline, Workflow, Agent, Tool, or typed-port nodes into borderless foundational nodes.
- Make Group a clipping artboard, timeline, table, or continuously reflowing layout engine.
- Auto-register every generated candidate in AssetLibrary merely because generation completed.
- Let Canvas Webview choose asset paths, copy files, write `library.json`, mutate `.nkc`, or manage cache cleanup.
- Delete or silently relocate existing generated sources.
- Add Rust Engine, Protobuf, cloud sync, multi-user collaboration, or a new storage service.

## Decisions

### 1. Foundational presentation is descriptor-derived, not a persisted Basic profile

Canvas node/subsystem descriptors will identify whether an existing renderer is foundational low-chrome or structured. The right-dock Basic catalog may consume the same descriptors, but presentation is not inferred from a file path and is not written to `.nkc`.

Foundational nodes render a title row and their content surface without a persistent outer card border, shadow, footer action strip, or badge wall. Image/video content may retain its own rounded media bounds; text/Markdown may retain a subtle readable surface. Hover, selected, keyboard focus, editing, loading, missing, locked, and error states remain explicit. Selection/focus cannot be conveyed by the floating toolbar or color alone.

Professional/structured renderers retain their header, ports, semantic states, and boundaries. Opening a professional node while the right dock is Basic does not change its renderer.

Alternative rejected: use a persisted `basic` profile or add Basic node types. That would split one Canvas graph into two formats and contradict the accepted catalog-only Basic boundary.

Alternative rejected: remove `.node-card` styling globally. It would erase required structure from professional nodes and overload every renderer with recovery styling.

### 2. One selection-owned contextual toolbar projects existing actions

The Canvas selection overlay will host a screen-space contextual toolbar for one selected node or a batch toolbar for multi-selection. It will project actions from the existing node/container action policy and dispatch through the existing action owners. It does not introduce a second command registry or copy handler logic from `ContextMenu`.

The toolbar keeps a stable pixel size as Canvas zoom changes, stays inside the viewport, and exposes at most a small set of priority actions before an overflow menu. First click selects, double-click or Edit enters editing, blank Canvas click dismisses, and keyboard users can reach the same actions with a visible focus path. Hover-only actions remain optional hints, not the only way to invoke functionality.

Alternative rejected: embed permanent action buttons in every node. They recreate the card chrome and become noisy on large creative boards.

### 3. Manual Group is a spatial container in the render plan

The node render planner will become container-policy aware:

- top-level nodes always render;
- descendants of a manual spatial Group render as real nodes in the same transformed Canvas coordinate space;
- descendants owned by managed Scene/Gallery/Table/other summary policies continue through their owning container renderer;
- nested spatial Groups recurse with deterministic z-order and cycle rejection.

The Group frame renders behind descendants as a semi-transparent region with a floating name/count label. Clicking a child selects the child. Clicking the label, border, or empty Group region selects the Group. Dragging the label/border moves the Group subtree; dragging a child moves only that child. Ports and external connections continue to use actual absolute node bounds; collapsed Group projection may terminate descendant connections at the Group boundary through the existing connection-projection model.

Alternative rejected: render child cards inside the Group DOM using local CSS coordinates. Canvas connections, culling, marquee, hit testing, selection overlays, and nested groups already consume global node geometry; a second DOM coordinate system would duplicate those responsibilities.

### 4. Absolute position remains canonical; relative placement is derived

`CanvasNode.position` remains an absolute Canvas coordinate even when `parentId` is present. The relative placement is `child.position - parent.position` and is never persisted separately. Moving a Group applies one delta to the entire descendant subtree. Moving a child updates only its absolute position and then evaluates membership at drop.

For overlapping eligible containers, membership resolves deterministically to the deepest accepted spatial container under the drop point; ties use visible stacking and then stable identity. The resolver rejects self-parenting and cycles. Leaving a Group removes membership only on drop, not during pointer movement, so temporary edge crossings do not churn the graph.

Alternative rejected: change child positions to parent-local coordinates. That would require a breaking rewrite of culling, connections, playback projection, Agent summaries, clipboard, project fixtures, nested transforms, and all consumers of `CanvasNode.position` while creating no user-visible benefit.

### 5. Auto-arrange is an explicit atomic command; manual movement remains authoritative

New generated groups receive one initial arrangement based on stable candidate order. A creator can later invoke Sort/Auto-arrange by name, type, creation time, or the existing stable child order. The command atomically updates `container.childIds` and unlocked child positions through the Canvas store/history path. Manual child movement does not trigger reflow or rewrite child order.

When a child is dropped beyond the current content region, a manual Group expands outward to include it plus padding. It does not auto-shrink after inward movement; Fit to content is explicit. Manual Group resize is clamped to the descendant content bounds and must not hide children by accidental clipping. Collapse hides descendants without changing coordinates; expand restores the exact layout.

Alternative rejected: continuous grid layout. It would fight creator placement and turn Group into Gallery, whose accepted child types and deletion semantics are intentionally different.

### 6. Generated draft groups are runtime presentation, not `.nkc` facts

Canvas Extension owns a runtime generated-draft projection keyed by task/run/output identity and frozen Board target. The Webview receives a typed projection containing the Group label, candidate identities, render projections, retention state, per-candidate promotion state, and allowed actions. Runtime Group/node identities occupy a separate namespace and are merged into a presentation graph for rendering, but project save/codec paths reject them.

The generated candidates remain pinned in their owning task/generated-output lifecycle while the review surface is active. UI clearly labels unsaved, missing, promoting, saved-to-assets, added-to-board, and failed states. Closing a surface with unsaved candidates requires an explicit discard/keep-reviewing decision. If restart recovery metadata and bytes still exist, the Host may reconstruct the review group; if they were legitimately reclaimed, it returns an unavailable diagnostic rather than a blank or successful node.

Markdown and already-durable file/reference artifacts continue normal Board delivery. Generated binary media does not enter `.nkc` until promotion succeeds.

Alternative rejected: persist runtime draft refs in `.nkc`. Cache cleanup would then corrupt durable project facts.

Alternative rejected: automatically create AssetEntities for all completed candidates. It would fill a curated library with transient iterations and undo the generated-output versus AssetLibrary identity boundary.

### 7. AssetLibrary/AssetStore owns the only new durable save path

Save to Assets sends a versioned, idempotent Host request containing the draft identity/revision/digest, selected candidate IDs, provenance, requested Asset metadata, and frozen Board target/revision. AssetLibrary/AssetStore validates the source, copies or adopts bytes according to its own ingest policy, creates AssetEntity/variant/file facts, and returns stable Asset identities and source refs. Canvas never hardcodes an `assets` byte directory and never writes Asset facts directly.

After promotion, Canvas Extension applies the returned Asset-backed nodes and the normal manual Group to the frozen Board in one revision-checked Canvas authoring batch. The persisted Group is an ordinary `group` with ordinary media children; no generated-group node type is introduced. Runtime projections are removed only after both Asset promotion and Canvas apply are acknowledged.

Batch promotion is per-candidate idempotent rather than pretending filesystem and Canvas writes are globally atomic. If some candidates fail, successful AssetEntities remain valid, failed candidates stay reviewable, and the UI reports each result. If all assets save but Board apply conflicts, the assets remain in the library and the UI offers an explicit retry against the intended Board; it never retargets to the active Canvas.

Deleting a Canvas node or Group does not delete AssetLibrary bytes. Asset deletion follows AssetLibrary reference/confirmation policy and cannot be implemented as a Canvas shortcut.

Alternative rejected: write promoted bytes to `neko/generated/<kind>/` and merely add an Asset catalog row. That preserves the confusing second retention root the change is intended to remove.

### 8. Legacy generated sources remain readable but no longer receive new writes

Existing `neko/generated/<kind>/` sources and Canvas references remain valid durable legacy inputs. The new producer path is poisoned from writing new retained outputs there. The UI may offer Import/Save to Assets, which creates Asset identity without deleting the legacy file. Existing references are not rewritten until an explicit, revision-checked migration is accepted.

If a legacy path is missing, Canvas shows a visible unavailable/relink/import diagnostic. It does not search by filename, fall back to cache, or claim the asset is saved.

Alternative rejected: bulk move existing files during upgrade. Existing files may be Git-tracked, externally referenced, or intentionally organized; silent relocation risks valuable user data.

## Five-Layer Analysis

### Responsibility

- `@neko/shared` owns Canvas/container, runtime projection, promotion request/result, identity, validation, and source-safety contracts.
- Canvas domain core owns spatial membership, geometry, layout commands, persistent Group composition, revision checks, and history.
- Canvas Webview owns rendering, selection, focus, pointer/keyboard interaction, runtime presentation state, and user intent collection.
- Canvas Extension owns Webview protocol validation, runtime draft projection lifetime, Board target freezing, promotion orchestration, and Canvas apply.
- Agent task/result lifecycle owns generation/run identity and completion observation, but not Canvas layout or Asset storage.
- AssetLibrary/AssetStore owns durable bytes, AssetEntity/variant/file facts, provenance, duplicate policy, and deletion/reference behavior.
- ResourceCache/generated-output runtime owns unpromoted bytes, pinning, render projection, GC eligibility, and unavailable diagnostics.

### Dependency

Layer 0 contracts remain host-neutral. The Webview imports no Node or VS Code APIs and receives no filesystem path or Asset storage implementation. Extension and Asset adapters depend inward on shared contracts. Feature packages communicate through existing extension/facade contracts rather than importing each other's internals. Rust Engine remains media compute/probe authority and is not involved in Canvas organization or Asset catalog mutation.

### Interface

The minimum new/refined contracts are:

- a runtime Canvas generated-group projection with stable task/candidate/revision and retention state;
- an idempotent single/batch Save to Assets request and per-candidate result;
- a Canvas apply result that identifies Asset refs, created Group/children, target revision, and conflicts;
- descriptor-level foundational/structured presentation metadata if existing descriptors cannot express it;
- policy-aware render-plan and membership pure functions inside Canvas domain boundaries.

Unknown versions, missing candidates, digest/revision mismatch, stale Board targets, invalid Asset results, runtime IDs reaching `.nkc`, and container cycles fail visibly. No empty success, active-Canvas fallback, raw JSON write, direct path fallback, or generated-root fallback is permitted.

### Extension

Additional foundational node renderers opt into the same low-chrome descriptor policy. Future runtime candidate producers reuse the generated-group projection and promotion contract. Future spatial container policies can opt into the render planner only when they share manual absolute-coordinate semantics; managed containers remain isolated.

### Testing

- shared contract tests cover version/identity validation, runtime-versus-durable rejection, batch promotion results, container cycles, and deterministic membership;
- Canvas domain/store tests cover render planning, absolute geometry, subtree translation, drag-in/out, nesting, arrange/history, expand-only bounds, fit, collapse, and legacy-path poison behavior;
- Webview component tests cover low-chrome states, toolbar projection, single/multi-selection, focus, keyboard access, viewport collision, runtime group states, and partial failures;
- Asset producer/consumer tests prove AssetLibrary ownership, returned identity, provenance, idempotency, no new `neko/generated` writes, and no Canvas-side Asset deletion;
- Extension integration tests cover frozen target/revision, promotion then Canvas batch apply, retry, restart/unavailable state, and path-level proof that active Canvas and legacy delivery do not participate;
- focused Agent Evaluation covers real task completion, stable unpromoted generated-output identity, terminal delivery, and forbidden pre-promotion Asset lookup/import; because canonical Evaluation drives the TUI and cannot operate a VS Code Webview, runtime Group, explicit save, frozen Board apply, and replay/idempotency are accepted by isolated Extension Development Host scenarios instead of a mock Evaluation host;
- isolated Extension Development Host functional scenarios cover actual Canvas selection, drag, group movement, sorting, Save to Assets, errors, CSP/runtime diagnostics, light/dark themes, and keyboard/focus behavior.

### Proportionality

The design reuses the existing node descriptor/action policy, Canvas container model, absolute positions, history/store path, headless authoring, generated-output lifecycle, ResourceCache pinning, and AssetLibrary facade. It adds one runtime projection and one orchestration boundary because unpromoted content cannot safely enter `.nkc`. It does not add a second graph store, local coordinate system, database, feature flag, fallback renderer, or generic workflow engine.

## Risks / Trade-offs

- [Risk] Runtime generated groups may feel less durable than previous automatic Board delivery. -> Mitigation: show an explicit unsaved badge, pin active review outputs, provide single-click group promotion, warn before discard, and reconstruct only when the owning lifecycle still has valid evidence.
- [Risk] Removing new `neko/generated` writes overlaps the active generated-output/Asset identity cleanup. -> Mitigation: land the identity separation first or rebase this delta so generated-output IDs remain resource identities until explicit Asset promotion; never merge the two identities for convenience.
- [Risk] Rendering real Group descendants increases visible node count and interaction cost. -> Mitigation: make culling and render planning descendant-aware, freeze projection during transforms, keep overlays screen-space, and profile large synthetic nested Groups before optimization.
- [Risk] Group hit regions can steal child gestures. -> Mitigation: give child content precedence, restrict Group move initiation to label/border/empty background, and cover pointer plus keyboard selection paths.
- [Risk] Batch promotion can partially succeed. -> Mitigation: return per-candidate results, keep successful Asset identities, retain failed candidates, and make retries idempotent instead of attempting unsafe rollback.
- [Risk] Asset Library becomes noisy if creators save every variation. -> Mitigation: promotion remains explicit, group save allows review/selection, and Asset naming/tagging/provenance remain visible before commit.
- [Risk] Existing `neko/generated` files may be mistaken for new unsupported data. -> Mitigation: retain read support and explicit import while poisoning only new producer writes; never delete or silently move legacy files.
- [Risk] Low-chrome nodes may have ambiguous hit bounds or insufficient contrast. -> Mitigation: preserve visible hover/focus/selection/edit/error states, minimum text contrast, stable 150-300 ms feedback, and non-color cues.

## Migration Plan

1. Add shared delta contracts and tests for runtime draft-group identity, Asset promotion results, foundational presentation metadata, and runtime values forbidden from `.nkc`.
2. Poison new Board/generated producer writes to `neko/generated/<kind>/` while preserving explicit legacy read/import tests. Update fixtures so new success paths cannot pass through the old durable generated-root path.
3. Implement or refine the AssetLibrary/AssetStore promotion facade and batch idempotency before Canvas can request Save to Assets.
4. Change media task delivery to create the Extension-owned runtime review projection; keep Markdown and durable file/reference delivery on the existing Board path.
5. Implement policy-aware Canvas render planning and spatial Group interaction on the existing absolute-coordinate model, then remove the Group child-summary renderer as the success path for manual Group.
6. Add low-chrome foundational presentation and the selection-owned contextual toolbar using existing descriptors and dispatchers.
7. Connect single/group promotion to Asset-backed revision-checked Canvas composite authoring, including partial failure, retry, unsaved warning, and unavailable diagnostics.
8. Update interactive Canvas, Asset Library, cache/path, headless authoring, and generated lifecycle documentation to remove `neko/generated` as the new canonical Board retention root.
9. Run package/unit/integration gates, focused Agent Evaluation, and isolated Extension Development Host functional scenarios before archiving.

Rollback disables the new runtime projection entry and restores the prior UI only if no new generated-root writes are re-enabled. AssetEntities and files already created remain valuable user data and are never rolled back or deleted. Existing legacy generated sources remain readable throughout.

## Open Questions

None. Physical Asset file placement remains an AssetLibrary/AssetStore ingest-policy decision; Canvas depends only on stable returned Asset identity and source refs.
