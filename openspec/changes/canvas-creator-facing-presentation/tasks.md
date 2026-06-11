## 1. Presentation Contracts And Projection

- [x] 1.1 Add webview-local presentation types for creator view mode, scene table column ids, column profiles, filters, and row view models.
- [x] 1.2 Implement pure projection helpers that map a Scene node plus direct Shot children into storyboard table rows in canonical container order.
- [x] 1.3 Reuse or extract a narrow Shot preview-source helper from `NodeCardPolicy` so table image cells follow the same generated/reference image resolution path as Shot cards.
- [x] 1.4 Add i18n keys for scene table columns, view switch, field picker, filters, empty states, and unavailable image/status labels.

## 2. Scene Storyboard Table Surface

- [x] 2.1 Add a `scene-shot-table` child-slot presentation in `ContainerRenderer` without replacing the existing Scene creative rail/card view.
- [x] 2.2 Render the default Scene storyboard table columns: Shot, Image, Duration, Camera, Visual / Action, Characters, Dialogue / SFX, Tags / Style, and Status.
- [x] 2.3 Add the Scene view switch with Storyboard Table as the default and Creative View as the secondary mode.
- [x] 2.4 Add field-profile UI for optional professional columns without writing duplicated table data to `.nkc`.
- [x] 2.5 Add lightweight Scene filters for missing image, missing dialogue, failed generation, ungenerated, has diagnostics, current character, and current scene tag.
- [x] 2.6 Ensure long table text wraps, clamps, scrolls internally, or expands without overlapping neighboring cells, toolbar controls, or playback controls.

## 3. Shot Creator Detail Slimming

- [x] 3.1 Update `shot.basic` content section defaults so creator fields stay visible by default and machine-facing sections are collapsed in overlay/expanded surfaces.
- [x] 3.2 Keep source/generated media refs, image-prep plan, visual occurrences, character candidates, continuity diagnostics, batch execution plan, provider ids, confidence scores, source refs, and cost estimates reachable from advanced/diagnostic sections.
- [x] 3.3 Add concise image/source status display for Shot creator detail without exposing full ref collections by default.
- [x] 3.4 Verify Shot detail edits continue writing through existing field binding and node data update paths.

## 4. Other Container Presentation Follow-Ups

- [x] 4.1 Keep Gallery visual-grid-first and add a review/list mode entry point for labels, status, references, and Shot usage.
- [x] 4.2 Add a Group mixed-content overview that summarizes child type counts and statuses, with a type-grouped list option.
- [x] 4.3 Align Table node presentation toward a real review matrix rather than a generic grid of cards where current contracts allow it.
- [x] 4.4 Add or document Script creator presentation as a Fountain scene outline and linked-scene table without `.nks` / `.story` assumptions.
- [x] 4.5 Add or document Document creator presentation for page/source review and visual page grid provenance inspection.
- [x] 4.6 Keep Media, Text, Annotation, Project, Canvas Embed, Model, and Artboard lightweight unless a domain-specific open action provides richer inspection.

## 5. Runtime Boundaries And Persistence

- [x] 5.1 Ensure view mode, field picker state, filters, table scroll offsets, open popovers, active row focus, resolved Webview URLs, object URLs, and cache paths are not persisted into Shot, Scene, or Canvas business data.
- [x] 5.2 Preserve playback route/order separation: table display order follows Scene review projection while Preview playback continues to use Canvas playback plans and route resolvers.
- [x] 5.3 Preserve Webview/Extension Host boundaries: no VSCode API imports in Webview presentation code and no React imports in Extension Host code.

## 6. Tests And Quality Gates

- [x] 6.1 Add unit tests for Scene-to-table projection order, default columns, row field formatting, and filter predicates.
- [x] 6.2 Add component tests for Scene default storyboard table, view switching, field profile column visibility, and long-text bounded layout markers.
- [x] 6.3 Add tests proving table image cells reuse Shot preview-source behavior for generated images and referenced images.
- [x] 6.4 Add tests proving Shot advanced/diagnostic sections are collapsed by default while still reachable.
- [x] 6.5 Add persistence/runtime-state tests or source assertions that resolved URLs, cache paths, view state, and scroll/focus state are not serialized into Canvas data.
- [x] 6.6 Run focused Canvas Webview tests and build commands for the affected package.
- [x] 6.7 Run the Neko quality self-review and record validation commands plus residual risks in the implementation summary.
