## Why

Creative editors currently expose export-like actions inconsistently, and the recent Canvas toolbar entry conflated two different user intents: generating rendered deliverables and packaging existing project assets. This needs to be corrected before adding the same pattern to Cut, Audio, Canvas, Sketch, Puppet, and Model.

## What Changes

- Introduce separate toolbar entry concepts for `Export` and `Package`.
- Treat `Export` as a rendered, baked, transcoded, or serialized finished-product operation. Export entry points must be backed by an editor-owned render/export surface that can choose among product output types and uses the package's Engine, renderer, or ExportService runtime instead of the no-engine packaging path.
- Treat `Package` as a no-render ZIP archive operation that collects existing project files, references, manifests, and metadata without requiring Engine.
- Add package-owned toolbar buttons for Cut, Audio, Canvas, Sketch, Puppet, and Model where the package has a meaningful target action.
- Route toolbar clicks through package-owned Webview or Extension Host contracts; do not add cross-extension direct dependencies or a shared global deliverable service in this change.
- Rename the Canvas mixed "Export / package" toolbar entry into separate export and package intents.
- Keep existing commands and export services intact; this change adds discoverable entry points and minimal routing only.

## Capabilities

### New Capabilities

- `creative-export-package-toolbar-actions`: Distinguishes editor toolbar Export and Package actions, including ownership, routing, and per-package visibility expectations.

### Modified Capabilities

- `webview-ui-design-system`: Creative left rail toolbars shall expose export/package actions as icon buttons with shared toolbar primitives and stable data attributes.

## Impact

- Affected webviews: `neko-cut`, `neko-audio`, `neko-canvas`, `neko-sketch`, `neko-puppet`, `neko-model`.
- Affected Extension Host routing: Canvas, Puppet, and Model command/message handlers where SaveDialog or QuickPick ownership is required.
- Affected tests: toolbar/layout/protocol tests for touched packages.
- No persisted format change.
- No new Engine API in this change; this change exposes package-owned export surfaces and keeps future Engine-backed product formats behind those surfaces.
- No dependency from one creative package to another.
