## Context

The creative packages already have package-owned left rails after the workbench shell migration. Their export capabilities are not equivalent:

- Cut exports rendered video through `ExportService`.
- Audio exports mixdowns through audio service / engine routes.
- Canvas currently exposes storyboard PDF / shot ZIP through an Extension Host command path, and artboard PNG/SVG remains node-local.
- Sketch exports canvas pixels, spritesheets, and scene JSON from Webview state.
- Puppet exports ZIP asset packages through `PuppetAssetExportService`.
- Model exports GLB through the engine client and exports `.nkma` / `.nkmc` artifacts through `ModelAssetExportService`.

The important correction is that "export" and "package" are different operations. Export renders, bakes, transcodes, or serializes a finished artifact and is owned by the package's Engine-backed or ExportService-backed product-output surface. Export surfaces must be able to present product output types such as video files, image sequences, audio mixdowns, still images, GLB/assets, storyboard PDFs, or other finished artifacts as the package matures. Package writes a standard `.zip` archive of existing project files, source assets, manifests, and metadata without rendering and therefore must not require Engine availability.

## Goals / Non-Goals

**Goals:**

- Give Cut, Audio, Canvas, Sketch, Puppet, and Model clear toolbar entry points for Export and Package.
- Preserve package ownership: each editor controls its own buttons, message contracts, and command routing.
- Use shared toolbar primitives and consistent data attributes so tests and future UI audits can identify the actions.
- Reuse existing export services, panels, and commands whenever possible, and keep them responsible for product output type selection.
- Add only a minimal P0 package action where no package service exists yet: open an Extension Host save flow and produce a metadata-first `.zip` archive or route to the existing asset package command if already present.

**Non-Goals:**

- No new unified DeliverableService.
- No `.nkdeliverables` manifest implementation.
- No new Engine export API.
- No cross-package direct dependency.
- No attempt to make every package support every export format in this change.

## Decisions

### 1. Two Explicit Toolbar Actions

Each package may expose:

- `data-creative-left-rail-action="open-export"`
- `data-creative-left-rail-action="open-package"`

Both use icon buttons in the left rail. Export uses `DownloadIcon`. Package uses a package/archive icon when available; otherwise use an existing shared icon that communicates bundle/archive in the package style.

Alternative considered: one `open-deliverables` menu. Rejected because it repeats the current ambiguity and hides the engine/no-engine boundary.

### 2. Export Is Engine-Owned Or ExportService-Owned Product Output

Export actions route to the package's existing render/export surface:

| Package | Export P0 route                                                                                                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Cut     | Dispatch existing `showExportPanel` event / route through `neko.showExportPanel`.                                                             |
| Audio   | Open the existing right-side `ExportPanel`.                                                                                                   |
| Canvas  | Extension Host QuickPick for rendered storyboard/export outputs; no direct webview file write.                                                |
| Sketch  | Webview-owned export menu/actions for canvas PNG, spritesheet, and scene JSON until a broader Engine-backed sketch export surface exists.     |
| Puppet  | Use existing asset export commands for model/motion/config outputs; these currently package assets but are product-facing exported artifacts. |
| Model   | QuickPick between GLB export and existing motion/config artifact commands.                                                                    |

The toolbar button opens the package export surface; it must not silently create a project archive. A single export surface can offer multiple finished-product types, but the package archive belongs under Package.

### 3. Package Is Archive-Owned And Engine-Free

Package actions must not call Engine clients, render endpoints, or ExportService render methods. Package may:

- use current document/project JSON,
- collect referenced local files,
- write a standard `.zip` archive through Extension Host,
- include manifest metadata,
- warn about missing references.

For P0, packages that do not already have package services expose a command/menu entry and route to a narrow Extension Host handler that creates a project archive `.zip`. The archive must include the project source file plus the resolvable local asset-reference closure discovered from the project metadata. It is not valid for Package to write only the project file and manifest when the project references local media, model, document, script, texture, nested project, or package assets.

The shared P0 archive collector is intentionally conservative:

- It parses JSON project files and nested JSON-like asset manifests such as `.gltf`, `.model3.json`, `.nkc`, `.nkv`, `.nka`, `.nkm`, `.nkp`, `.nks`, `.nkma`, `.nkmc`, `.nkpm`, and related Neko JSON assets.
- It resolves relative paths against the file that contains the reference.
- It resolves absolute paths and `file:` URIs directly.
- It resolves `${VAR}/path` through the existing `neko.assets.resolvePath` command when available, without requiring Engine startup.
- It ignores remote URLs, data/blob URLs, VSCode command URIs, and archive-internal entry paths such as `documentResourceRef.entryPath`.
- It records unresolvable or unreadable references in `package-manifest.json` under `missingReferences`.

External files outside the project directory are copied into `assets/external/<hash>-<basename>` to keep ZIP paths stable and avoid collisions. Project-local references keep their relative path inside the archive.

Where a package already maintains an Extension Host project cache or can send a current Webview-owned project snapshot through a package-owned message, the package should pass the current serialized project bytes into the shared archive collector so Package reflects unsaved in-editor edits. This applies to Canvas, Cut, Audio Project, and Puppet in P0. Packages whose authoritative state remains Engine-derived can still use the saved source file until they expose a stable Extension Host serialization contract; the collector behavior remains the same once source bytes are supplied.

### 4. Package-Owned Routing

Webview-only packages or actions can update local UI state directly. Any action that needs VSCode QuickPick, SaveDialog, workspace filesystem, or active document path must use package-owned postMessage contracts and Extension Host handlers.

The handlers must be whitelisted by action name or message type. Webview messages must not execute arbitrary command IDs.

### 5. Minimal Test Contract

Each touched package must have one or more of:

- Toolbar unit test asserting the Export and/or Package button exists with stable data attributes.
- Layout/source contract test asserting the parent app wires the toolbar callback.
- Protocol/source contract test asserting Extension Host handlers whitelist the message and call expected existing command/service paths.

## Risks / Trade-offs

- [Risk] Users may expect Package to be fully implemented for every package immediately. -> Mitigation: P0 labels and handlers distinguish existing package operations from future archive packaging, and no package button should pretend to render or transcode.
- [Risk] Puppet asset ZIP exports blur the line because they are named export but do not require Engine. -> Mitigation: Treat them as asset export artifacts under Export for P0, while the Package button is reserved for whole project/archive packaging.
- [Risk] Adding two buttons to dense left rails can crowd Sketch/Cut. -> Mitigation: Export/Package sit in global action area and can be hidden if a package has no valid P0 route.
- [Risk] Extension Host command reuse can preserve legacy naming. -> Mitigation: toolbar and message contract use new explicit action names even when they call an existing command internally.

## Migration Plan

1. Rename the Canvas mixed entry to explicit Export and add a separate Package action path.
2. Add package-owned Export/Package toolbar callbacks per package.
3. Reuse existing export panels and commands for Export.
4. Add no-engine package message/command stubs where needed, with visible user feedback if full archive packaging is not yet available.
5. Add focused tests per package.
6. Rollback by removing the new toolbar buttons and message handlers; existing commands and export services remain unchanged.
