## Context

Canvas has moved toward composable content, generic containers, `NodeCardPolicy`,
and host-owned preview/resource resolution. At the same time, storyboard imports
and Agent workflows now attach rich data to Scene and Shot nodes: creator text,
reference media, generated media, image-prep plans, semantic indexing evidence,
continuity diagnostics, and batch execution metadata.

The current presentation shape does not separate those audiences well. A Shot
detail surface can expose many machine-facing fields, while a Scene container
still lacks a dense table view for reviewing every shot in the scene. Agent's
storyboard table has the right review information architecture, but Canvas must
implement the experience through Canvas content projections and preview
resolution rather than importing Agent Webview components.

Five-layer analysis:

- **Responsibilities:** Scene owns multi-shot review; Shot owns single-shot
  refinement; advanced diagnostics stay available but secondary.
- **Dependencies:** Presentation depends on Canvas node data, container order,
  and preview descriptors. It must not depend on Agent Webview components,
  VSCode APIs, or runtime URLs.
- **Interfaces:** View modes, column profiles, filters, and advanced section
  defaults are declarative content-layer presentation inputs.
- **Extension:** New columns and review surfaces should register presentation
  profiles and reuse field readers/preview-source policy helpers.
- **Testing:** Requirements are testable through projection, rendering, i18n,
  preview-source reuse, and overflow assertions.

## Goals / Non-Goals

**Goals:**

- Make Scene expanded/overlay surfaces default to a storyboard table for fast
  creative review.
- Keep a secondary Scene creative/card view for visual rhythm and image
  comparison.
- Slim Shot default detail to creator-relevant fields while retaining advanced
  generation, refs, indexing, continuity, and batch details behind collapsed
  sections.
- Add deterministic table field profiles, view switching, and lightweight
  filters for storyboard review.
- Reuse Canvas `NodeCardPolicy` and `CardPreviewSlot` preview paths for table
  image cells.
- Provide presentation direction for Gallery, Group, Table, Script, Document,
  Media, Text, Annotation, Project, Canvas Embed, Model, and Artboard nodes.

**Non-Goals:**

- Do not change `CanvasNodeBase`, container ownership, or `.nkc` persistence
  shape.
- Do not add or revive `.nks`, `.story`, or a standalone storyboard format.
  Script presentation uses Fountain-derived scene outlines.
- Do not copy Agent storyboard table components into Canvas.
- Do not implement media playback, video editing, image generation, batch
  execution, or resource-cache materialization in this change.
- Do not persist runtime view state such as open filter popovers, resolved
  Webview URLs, object URLs, current scroll position, or active row focus.

## Decisions

### Decision 1: Scene Defaults To Storyboard Table

Scene is the only built-in node that naturally owns a sequence of storyboard
shots. Its expanded/overlay creator surface will default to a table where each
row is a Shot child in canonical container order.

Default columns:

- Shot
- Image
- Duration
- Camera
- Visual / Action
- Characters
- Dialogue / SFX
- Tags / Style
- Status

Alternatives considered:

- Keep the current Shot rail as default. Rejected because it is good for visual
  browsing but poor for checking continuity, missing dialogue, duration, and
  prompt/status coverage across a scene.
- Put the table in Shot details. Rejected because a Shot is not the owner of
  scene-level order or multi-shot comparison.

### Decision 2: Treat View Mode As Container Presentation State

The Scene surface exposes a compact switch:

```text
[Storyboard Table] [Creative View]        [Fields] [Filter] [Sort]
```

The switch belongs in the Scene/workbench surface, not inside every child Shot.
The bottom area remains available for playback controls when the same concepts
appear in Preview.

Alternatives considered:

- Put view switching in the bottom playback bar. Rejected because view mode is a
  review/editing choice, while the bottom bar owns transport and timeline.
- Add view switching to every node. Rejected because simple nodes do not need
  multiple modes and the extra chrome would dilute the authoring surface.

### Decision 3: Use Column Profiles Instead Of Full-Field Rendering

The table starts with a creator review profile and lets users enable
professional columns through a field picker. Professional columns include
character description, character reference, separate reference image,
storyboard prompt, video camera prompt, image strategy, source/generated media
refs, and diagnostics.

Column profiles must be declarative and deterministic. They can be persisted as
user/workspace preference later, but the first implementation may keep them as
Webview UI state or preset defaults as long as no runtime URLs or duplicated
business data are written to `.nkc`.

Alternatives considered:

- Render every Shot field. Rejected because it recreates the current overload
  and makes the table too wide for review.
- Hardcode columns inside one Scene component. Rejected because Gallery,
  Document, Script, and Table review surfaces need similar profile concepts.

### Decision 4: Reuse Canvas Preview Resolution For Image Cells

Scene table image cells will reuse the existing Canvas preview-source path:
`NodeCardPolicy.resolvePreviewSource()` or a shared helper derived from it, then
`CardPreviewSlot` or the same resolver boundary renders the thumbnail.

This keeps generated images, runtime reference images, `referenceImagePath`,
`referenceImageResourceRef`, and stable resource refs consistent with Canvas
cards. The table must not use Agent `MediaPreview`, raw `<img>` ad hoc path
logic, or durable cache paths as source of truth.

Alternatives considered:

- Copy Agent's media row renderer. Rejected because Agent media rows are based
  on chat tool-result sections, while Canvas has node-card policies and host
  resource-cache resolution.
- Read `referenceImagePath` directly in table cells. Rejected because it misses
  generated candidates, stable resource refs, runtime safety checks, and the
  preview resolver fallback chain.

### Decision 5: Slim Shot Detail Through Section Defaults

Shot default detail keeps creator fields visible and collapses machine-facing
sections. This is implemented by content preset section metadata and renderer
collapse defaults, not by deleting fields or changing Shot data.

Visible by default:

- preview image/video/reference
- duration, shot scale, camera angle, camera movement
- visual description and character action
- characters, emotion
- dialogue, voice-over, sound cue
- visual style, generation prompt
- concise image/source status

Collapsed by default:

- source/generated/legacy media refs
- image-prep plan
- visual occurrences
- character candidates
- continuity diagnostics
- batch execution plan
- provider ids, confidence scores, source refs, cost estimates

Alternatives considered:

- Remove advanced fields from Canvas. Rejected because Agent, diagnostics, and
  production review still need them.
- Keep all advanced sections expanded in overlay. Rejected because overlay is
  also the creator refinement surface and should not default to debugging.

### Decision 6: Optimize Other Nodes By Content Shape

Presentation follows the content shape:

- Gallery: visual grid first, optional list/review mode.
- Group: mixed-content overview and type-grouped list.
- Table: true table/matrix container rather than a grid of cards.
- Script: Fountain scene outline and linked-scene table.
- Document: page/source review table and visual page grid.
- Media: lightweight preview/detail with consistent media metadata.
- Text/Annotation: simple text editing.
- Project/Canvas Embed/Model/Artboard: lightweight reference cards with
  domain-specific open actions.

Alternatives considered:

- Apply storyboard-table UI to every container. Rejected because Gallery and
  Document have visual comparison/page-review needs, while Group and Table are
  generic organization constructs.

## Risks / Trade-offs

- **Table complexity grows quickly** -> Start with the default creator review
  columns and implement professional columns through a field profile instead of
  adding every field to the default table.
- **Preview-source reuse may be awkward inside table cells** -> Extract a small
  shared helper only if `NodeCardPolicy.resolvePreviewSource()` is too card
  shaped; keep the resolver boundary unchanged.
- **View state persistence scope may be unclear** -> Keep first implementation
  deterministic and transient; add workspace/user persistence only after the
  profile contract stabilizes.
- **Large scenes may render many cells** -> Keep row rendering bounded,
  virtualize later if necessary, and cap expensive async preview resolution to
  visible rows.
- **Long text can overlap or make rows unusable** -> Use stable row layout,
  wrapping, line clamps, and per-cell expansion/scroll behavior; add visual
  tests or DOM assertions.
- **Script node still references old formats in some docs/types** -> Presentation
  must use Fountain semantics and avoid `.nks` / `.story` assumptions; any
  wording cleanup can be tracked separately if it touches shared type comments.

## Migration Plan

No Canvas file migration is required. Rollout can be staged:

1. Add scene table projection helpers and column profile types.
2. Add Scene storyboard table presentation and view switch while keeping the
   current visual rail as creative view.
3. Adjust Shot content preset collapse defaults and visible creator fields.
4. Add filters and field picker.
5. Add Gallery/Group/Table/Script/Document presentation follow-ups as separate
   implementation batches if needed.

Rollback is presentation-only: revert the new presentation selection to the
existing child-slot rail/grid and restore previous Shot section defaults. Canvas
data remains compatible because no persistent schema changes are introduced.

## Open Questions

- Should view-mode and field-profile preferences be stored per Webview session,
  workspace, or Canvas document after the default behavior is validated?
- Should large Scene tables use virtualization in the first implementation or
  only after performance profiling on large storyboards?
- Should professional columns be globally configurable or scoped per node type?
