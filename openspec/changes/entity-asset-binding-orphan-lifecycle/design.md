## Context

The ADR `docs/architecture/adr-storyboard-entity-canvas-projection-boundary.md` separates creative entity identity from representation assets. A confirmed character can remain valid even when its portrait file is deleted. Existing `EntityAssetBinding.status` describes review state, but it cannot also represent file availability without losing whether the missing binding was confirmed, suggested, rejected, or deprecated.

The same ADR also allows "draw first, name later" workflows. Candidates derived from placeholders, visual observations, or asset filenames need stable ids and provenance, but their names are not reliable enough for fuzzy name matching.

## Goals / Non-Goals

**Goals:**

- Preserve entity identity and binding review state when an asset becomes unavailable.
- Add `availability` and `orphanedAt` to bindings with backward-compatible defaults.
- Detect project-local asset deletion and restoration through VSCode `FileSystemWatcher`.
- Surface orphaned state in Dashboard, Canvas, Hover Card, Quick Panel, and Inspector projections.
- Add `identityBasis` to candidates and exclude non-user-named candidates from all name-based matching paths.
- Keep non-local availability detection behind Asset Federation resolver refresh/probe contracts.

**Non-Goals:**

- Do not delete entities or bindings automatically when an asset disappears.
- Do not define the full Asset Federation refresh contract here.
- Do not create a fourth binding availability state for unknown non-local refs.
- Do not rewrite source Storyboard, Canvas, or asset metadata as part of orphan marking.
- Do not implement Canvas inline entity reference behavior in this change.

## Decisions

### Decision 1: `status` and `availability` are orthogonal

`status` remains the binding review state. `availability` describes whether the referenced representation resource is usable. A confirmed binding can be orphaned, and a suggested binding can be orphaned; these states carry different cleanup priority and must not collapse into one enum.

Alternatives considered: overloading `status` with `orphaned` or deleting broken bindings. Overloading loses review information; deletion loses user intent and prevents automatic restore.

### Decision 2: Project-local orphan lifecycle is event-driven and recoverable

For `project://` refs that resolve to workspace files, `vscode.workspace.FileSystemWatcher` marks matching bindings `availability='orphaned'` and records `orphanedAt` when the asset disappears. If the file is restored, matching orphaned bindings return to `active` and clear `orphanedAt` while retaining `status`.

The watcher updates bindings through entity runtime services and emits normal entity change events so Dashboard, Canvas, Inspector, and search refresh consistently.

### Decision 3: Non-local refs depend on Asset Federation

`market://`, `shared://`, and `external://` refs are not reliably covered by workspace file watching. This change records the expected integration boundary: federation resolver refresh/probe events may mark availability later. Until that exists, UI can show on-demand unavailable results but does not promise real-time orphan marking.

### Decision 4: Anonymous candidates use `identityBasis`

`CreativeEntityCandidate.identityBasis` is added with values `user-named`, `placeholder`, `visual`, and `asset`. Old candidates default to `user-named` for compatibility. Only user-named candidates participate in name-based fuzzy matching.

Candidate ids, asset reverse lookup, visual occurrence refs, provenance, and explicit user choices remain valid association mechanisms for non-user-named candidates.

### Decision 5: UI degradation preserves creative flow

Consumers show orphaned binding state rather than blocking the workflow. Canvas uses placeholder thumbnails and broken markers, Hover Card/Quick Panel/Inspector show the textual entity context, and Dashboard provides rebind, restore guidance, archive, or cleanup actions.

## Risks / Trade-offs

- **Risk: FileWatcher misses deletes outside the workspace.** -> Scope P2 to project-local refs and document federation dependency for non-local refs.
- **Risk: path resolution differs from `assetRef` resolution.** -> Route watcher updates through `AssetRefResolver` and existing project path resolution instead of comparing raw absolute paths as authority.
- **Risk: orphan marking floods events during bulk moves.** -> Batch updates per project and emit coalesced entity change events.
- **Risk: excluding non-user-named candidates from name search hides useful results.** -> Keep id, provenance, visual occurrence, asset reverse lookup, and explicit TreeView/Dashboard browsing paths available.
- **Risk: old data lacks fields.** -> Apply defaults during read/validation: `availability='active'`, missing `identityBasis='user-named'`.

## Migration Plan

1. Extend shared contracts and validators with backward-compatible defaults.
2. Update binding persistence and candidate serialization to write explicit values for new or changed records.
3. Update entity matching/resolution code paths to filter non-user-named candidates from name-based matching.
4. Implement project-local FileWatcher wiring and runtime orphan/restore service methods.
5. Update Dashboard, Canvas, Hover Card, Quick Panel, and Inspector projections to render orphaned availability.
6. Add tests for migration defaults, watcher events, UI projection, and matching exclusion.
7. Add placeholder integration points for future Asset Federation availability events without promising real-time non-local detection.
