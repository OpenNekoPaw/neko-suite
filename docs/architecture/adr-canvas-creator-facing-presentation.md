# ADR: Canvas Creator-Facing Presentation

- **Status**: Proposed
- **Date**: 2026-06-10
- **Scope**: neko-canvas webview presentation layer, Canvas content presets, container child-slot presentations
- **Depends on**: `adr-canvas-generic-container-card.md`
- **Related**: `adr-canvas-preview-boundary.md`, `adr-canvas-preview-sessions-and-routes.md`, `adr-agent-storyboard-table-schema.md`, `adr-canvas-artifact-reference-resolution.md`, `adr-storyboard-entity-canvas-projection-boundary.md`

---

## Context

Canvas nodes can carry production, generation, reference, indexing, and diagnostic
fields. That is useful for Agent execution, media provenance, export, and
debugging, but it makes the default creator experience too dense. A storyboard
shot currently exposes many machine-facing fields next to creator-facing fields,
while a scene container does not yet provide a fast, table-like review surface
for all shots in the scene.

Agent's storyboard table demonstrates a more creator-friendly review shape:
scene groups, one row per shot, and a compact set of columns such as shot,
image, duration, camera, visual/action, characters, dialogue/SFX, style/prompt,
and strategy. Canvas should adopt the same information architecture, but it must
not copy Agent's webview implementation directly. Canvas has its own node model,
resource-cache path, `NodeCardPolicy`, `CardPreviewSlot`, and preview resolver.

The core product goal is:

> Scene is the fast storyboard review surface. Shot is the focused single-shot
> refinement surface. Generation, indexing, provenance, and batch diagnostics are
> advanced surfaces by default.

---

## Decision

Canvas presentation is split into three creator-facing layers:

1. **Review surface**: dense, scannable summaries for fast creative inspection.
2. **Refinement surface**: focused editing for the currently selected item.
3. **Advanced/diagnostic surface**: generation plans, refs, provider metadata,
   indexing evidence, cost estimates, and batch execution details.

This is a presentation decision, not a persistence decision. It must not require
changes to `CanvasNodeBase`, container ownership, or resource-reference storage.
The content layer should use child-slot presentations, column profiles, view
modes, and section collapse defaults while continuing to reuse
`NodeCardPolicy`, `CardPreviewSlot`, and the existing preview/resource resolver.

---

## Architecture Fit

### Responsibility

- `scene` owns storyboard review and scene-level inspection.
- `shot` owns single-shot refinement.
- `gallery`, `group`, `table`, `script`, `document`, and `media` each expose the
  presentation that matches their content shape.
- Advanced diagnostics stay available but are not part of the default creator
  surface.

### Dependency

Presentation depends on Canvas data and preview descriptors. It must not depend
on Agent webview components, VSCode APIs, or runtime resource URLs. Resource
display must continue through the Canvas preview/resource resolver boundary.

### Interface

Creator-facing views are content-layer projections:

- child-slot presentations, for example `scene-shot-table`
- column profiles for table-like views
- view-mode state, for example storyboard table vs creative view
- collapsible section defaults for advanced detail

These interfaces should be declarative and serializable so they can later be
promoted to shared contracts if Preview, Agent, or exporters need to consume the
same presentation profile.

### Extension

New review surfaces should be added by registering presentation profiles rather
than hardcoding node-specific branches into generic renderers. New columns should
reuse field readers and preview-source policy helpers.

### Testing

Tests should cover default scene table columns, field visibility profiles, shot
advanced sections being collapsed by default, preview-source reuse for referenced
images, and overflow behavior for long text cells.

---

## Scene And Shot

### Scene

`scene` is the primary storyboard review container. Its default expanded or
overlay view should be a storyboard table optimized for reviewing the whole
scene quickly. A visual/creative card view can remain available as a secondary
mode for rhythm and image comparison, but the table is the default because it
surfaces continuity and missing-content issues faster.

Default storyboard table columns:

| Column | Source fields |
|--------|---------------|
| Shot | `shotNumber`, stable id when useful |
| Image | generated image, runtime reference image, reference image/resource fallback |
| Duration | `duration` |
| Camera | `shotScale`, `cameraAngle`, `cameraMovement` |
| Visual / Action | `visualDescription`, `characterAction` |
| Characters | summarized `characters` |
| Dialogue / SFX | `dialogue`, `voiceOver`, `soundCue`, summarized cues |
| Tags / Style | `sceneTags`, `emotion`, `visualStyle`, selected VFX |
| Status | generation status, missing image/dialogue/reference diagnostics |

Optional professional columns can be enabled from a field picker:

- character description
- character reference
- separate reference image
- storyboard prompt
- video camera prompt
- image strategy
- source/generated media refs
- diagnostic details

Long text cells should wrap and support internal expansion or scrolling without
overlapping adjacent cells.

### Shot

`shot` is the refinement surface for a single storyboard panel. Its default
content should show only creator-relevant fields:

- image/video/reference preview
- duration
- shot scale
- camera angle
- camera movement
- visual description
- character action
- characters
- emotion
- dialogue
- voice-over
- sound cue
- visual style
- generation prompt
- concise image/source status

Machine-facing sections belong in collapsed advanced/diagnostic sections by
default:

- `sourceMediaRefs`
- `generatedMediaRefs`
- `mediaRefs`
- `shotImagePrepPlan`
- `visualOccurrences`
- `characterCandidates`
- `continuityDiagnostics`
- `batchExecutionPlan`
- provider ids
- confidence scores
- source refs
- cost estimates

---

## Other Containers And Nodes

Not every node should become a storyboard table. The optimized presentation
depends on whether the object is a review container, visual collection, or
single-item detail.

| Object | Default creator surface | Secondary surface | Notes |
|--------|-------------------------|-------------------|-------|
| `scene` | Storyboard table | Visual/creative card view | Default to table for fast review. |
| `shot` | Focused refinement detail | Advanced diagnostics | Do not default to all production fields. |
| `gallery` | Visual grid | List/review mode | Preserve image comparison as the primary task; list mode can show labels, status, references, and shot usage. |
| `group` | Mixed-content overview | Type-grouped list | Generic groups should summarize child types and status; if all children are shots, suggest scene-style review. |
| `table` | Real table/matrix | Mixed node cards | Treat as a generic review matrix, not merely a grid of child cards. |
| `script` | Fountain scene outline | Linked-scene table | Use Fountain directly; do not revive deprecated `.nks` / `.story` assumptions. |
| `document` | Page/source review table | Visual page grid | Useful for PDF/CBZ/comic source inspection and shot reference provenance. |
| `media` | Media preview/detail | Metadata panel | Keep lightweight; improve consistency with shared media preview behavior. |
| `text` / `annotation` | Simple text edit | None by default | Avoid extra modes unless attached to a larger review flow. |
| `project` / `canvas-embed` / `model` / `artboard` | Reference card | Domain-specific open action | Keep lightweight unless the owning domain provides richer inspection. |

---

## View Switching

View switching belongs at the container/workbench level, not inside every node.
For scene storyboard review, the top bar should expose a compact mode switch and
table tools:

```text
[Storyboard Table] [Creative View]        [Fields] [Filter] [Sort]
-------------------------------------------------------------------
Review table or visual card view
```

The bottom area remains reserved for playback transport and timeline controls.
Field visibility is a column-profile concern and should be deterministic,
persistable, and testable.

Initial filters should cover common review tasks:

- missing image
- missing dialogue
- generation failed
- ungenerated
- has diagnostics
- current character
- current scene tag

---

## Implementation Guidance

1. Add creator-facing presentations as content-layer projections such as
   `scene-shot-table`; do not encode table rendering into `CanvasNodeBase`.
2. Reuse `NodeCardPolicy.resolvePreviewSource()` and `CardPreviewSlot` for image
   cells so generated and referenced images follow the same cache/resource
   resolution path as Canvas cards.
3. Keep table/field profiles declarative and serializable.
4. Preserve the distinction between route/playback order and table display
   order. The table is a review projection; playback continues to use the Canvas
   playback plan and route resolver.
5. Keep Agent's storyboard table as an information-architecture reference, not a
   component dependency.

---

## Verification Criteria

1. Opening a scene in the expanded/overlay creator surface defaults to the
   storyboard table view.
2. The scene table shows the default creator columns listed above and supports
   stable horizontal scrolling without text overlap.
3. Field visibility can enable professional columns without changing persisted
   node data.
4. Shot detail defaults to creator-relevant fields and keeps advanced diagnostic
   sections collapsed.
5. Image cells reuse the same preview-source/resource-cache path as Canvas cards,
   including generated images and referenced images.
6. Gallery remains visual-grid-first and gains a review/list mode without losing
   image comparison ergonomics.
7. Script presentation uses Fountain scene outline semantics and does not depend
   on deprecated `.nks` / `.story` designs.
8. Tests cover scene table projection, shot section collapse defaults, preview
   source reuse, and long-text overflow behavior.
