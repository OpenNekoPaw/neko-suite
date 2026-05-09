## MODIFIED Requirements

### Requirement: Canvas layer boundaries communicate through contracts
The system SHALL make layer interactions use IDs, field bindings, endpoint references, policy names, preview descriptors, and store actions. Migrated Webview production paths MUST use shared layer helpers or registries at layer boundaries and MUST NOT read removed Scene/Shot containment mirrors.

#### Scenario: Content references a relationship endpoint
- **WHEN** a connection endpoint targets a block or field
- **THEN** the endpoint references `blockId` or `fieldPath` while the content block does not own the connection object

#### Scenario: Content displays organization children through summaries
- **WHEN** a container node displays its children inside node content
- **THEN** it uses child IDs, a child-node slot, and node preview descriptors rather than embedding child node components as owned content

#### Scenario: Migrated render path uses layer helpers
- **WHEN** a migrated Scene, Group, Shot, Gallery, or Media Webview feature needs parent or child membership
- **THEN** it reads membership through layer helpers such as `getContainerChildIds` and `getNodeParentId` rather than directly branching on `data.shotIds` or `data.sceneGroupId`

#### Scenario: Removed core mirrors are not used
- **WHEN** Scene or Shot membership changes
- **THEN** the implementation updates canonical `container.childIds` and child `parentId` without writing `data.shotIds` or `data.sceneGroupId`

### Requirement: Canvas schema uses composable core nodes
The system SHALL create Shot, Scene, Gallery, and Media nodes with composable `content`, canonical `container`/`parentId` organization fields, preview capabilities, and endpoint metadata where applicable. The pre-launch schema MAY break old core-node files that depended on removed legacy React renderers or Scene/Shot membership mirrors.

#### Scenario: Core node without content has no legacy renderer
- **WHEN** a Shot, Scene, Gallery, or Media node lacks composable `content`
- **THEN** the Webview does not route it through removed legacy core renderers

#### Scenario: Unknown future fields are preserved
- **WHEN** a Canvas file contains optional layer fields not used by the current renderer
- **THEN** load/save behavior preserves those fields unless an explicit migrator removes them

#### Scenario: New migrated node preserves authoritative data
- **WHEN** the Webview creates a Shot, Scene, Gallery, or Media node through a migrated preset
- **THEN** the node contains authoritative `node.data` fields for editable state plus the optional layer fields needed by the four-layer renderer

#### Scenario: Removed core legacy presets are rejected
- **WHEN** code requests `shot.legacy`, `scene.legacy`, `gallery.legacy`, or `media.legacy`
- **THEN** creation rejects the preset instead of creating a legacy core node
