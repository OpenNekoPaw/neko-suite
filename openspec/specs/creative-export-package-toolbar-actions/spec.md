# creative-export-package-toolbar-actions Specification

## Purpose
Define separate creative editor toolbar semantics for product export and project/package archive actions.
## Requirements
### Requirement: Export and Package are separate toolbar actions

Creative editor toolbars SHALL expose Export and Package as separate actions whenever both operations are meaningful for that package. Export SHALL represent rendered, baked, transcoded, or serialized product output and SHALL open a package-owned product-output surface that can support multiple finished artifact types. Package SHALL represent a standard `.zip` archive of existing project files, references, manifests, and metadata.

#### Scenario: User sees separate actions

- **WHEN** a creative editor supports both export and package entry points
- **THEN** the left rail exposes distinct Export and Package buttons rather than a combined "Export / Package" button

#### Scenario: Package does not render

- **WHEN** a user invokes Package from a creative editor toolbar
- **THEN** the package route does not call Engine render, transcode, bake, or export APIs

#### Scenario: Package saves a standard ZIP

- **WHEN** a user invokes Package from a creative editor toolbar
- **THEN** the package route saves a `.zip` file rather than a custom package extension or package directory

#### Scenario: Export chooses product type

- **WHEN** a user invokes Export from a creative editor toolbar
- **THEN** the package opens an export panel, picker, or command path that can select among the package's supported finished-product types instead of creating a project archive

### Requirement: Export routes to package-owned render or artifact surfaces

Each creative package SHALL route Export to its package-owned Engine-backed, ExportService-backed, or renderer-owned export surface, command, or service. Webviews SHALL NOT execute arbitrary VSCode command IDs; Extension Host handlers SHALL whitelist the supported export intent.

#### Scenario: Export requires VSCode file APIs

- **WHEN** an Export action needs QuickPick, SaveDialog, workspace filesystem, or active document resolution
- **THEN** the Webview sends a package-owned intent to Extension Host and the Extension Host handles only whitelisted export actions

#### Scenario: Export is already Webview-owned

- **WHEN** an Export action can be completed by an existing Webview export panel or local export UI
- **THEN** the toolbar opens that package-owned UI rather than adding a duplicate Extension Host flow

#### Scenario: Export uses the product-output runtime

- **WHEN** an Export action needs rendering, baking, transcoding, or engine-side serialization
- **THEN** the package-owned export surface uses the package's Engine, renderer, or ExportService runtime and reports runtime unavailability as an Export concern, not as a Package concern

### Requirement: Package routes to archive-owned no-engine flows

Each Package action SHALL route to a package-owned ZIP archive flow that can operate without Engine availability. Package flows SHALL collect the project source file, resolvable local asset references, manifest metadata, and dependency/missing-reference lists. Package flows MUST NOT only add the project file when the project metadata references local files.

#### Scenario: Engine unavailable

- **WHEN** Engine is not running and the user invokes Package
- **THEN** the package flow can still open or report a package/archive result without requiring Engine startup

#### Scenario: Package includes referenced assets

- **GIVEN** a creative project file references local media, model, document, script, texture, nested project, or package assets through relative paths, absolute paths, `file:` URIs, or configured `${VAR}/path` variables
- **WHEN** a user invokes Package
- **THEN** the saved `.zip` contains the project file, `package-manifest.json`, and each resolvable referenced local asset
- **AND** project-local assets keep their relative archive path while external assets are copied under an external-assets archive namespace
- **AND** unreadable or unresolved references are recorded in `package-manifest.json` instead of being silently ignored

#### Scenario: Package uses current project state when available

- **GIVEN** a package maintains an Extension Host cache of the current project document
- **WHEN** a user invokes Package before manually saving the project
- **THEN** the package route supplies the current serialized project bytes to the archive flow
- **AND** referenced assets added by unsaved in-editor edits are eligible for inclusion in the `.zip`

#### Scenario: Package implementation is partial

- **WHEN** a package exposes a Package toolbar button before full archive packaging is implemented
- **THEN** the user receives clear Extension Host feedback and no rendered export is attempted

### Requirement: Package-specific toolbar identity is stable

Export and Package buttons SHALL use stable data attributes for layout and regression tests:

- Export: `data-creative-left-rail-action="open-export"`
- Package: `data-creative-left-rail-action="open-package"`

#### Scenario: Toolbar regression test

- **WHEN** a package toolbar test renders a toolbar with Export or Package enabled
- **THEN** the test can locate the action by its stable `data-creative-left-rail-action` value
