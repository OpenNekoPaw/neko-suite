## MODIFIED Requirements

### Requirement: Canvas layer boundaries communicate through contracts
The system SHALL make layer interactions use IDs, field bindings, endpoint references, policy names, preview descriptors, and store actions. Migrated Webview production paths MUST use shared layer helpers or registries at layer boundaries and MUST NOT introduce new direct reads of legacy containment fields outside compatibility helpers.

#### Scenario: Content references a relationship endpoint
- **WHEN** a connection endpoint targets a block or field
- **THEN** the endpoint references `blockId` or `fieldPath` while the content block does not own the connection object

#### Scenario: Content displays organization children through summaries
- **WHEN** a container node displays its children inside node content
- **THEN** it uses child IDs, a child-node slot, and node preview descriptors rather than embedding child node components as owned content

#### Scenario: Migrated render path uses layer helpers
- **WHEN** a migrated Scene, Group, Shot, Gallery, or Media Webview feature needs parent or child membership
- **THEN** it reads membership through layer helpers such as `getContainerChildIds` and `getNodeParentId` rather than directly branching on `data.shotIds`, `data.childIds`, or `data.sceneGroupId`

#### Scenario: Legacy compatibility remains centralized
- **WHEN** the system must mirror or read legacy containment fields during migration
- **THEN** that behavior is implemented in compatibility helpers, migration helpers, or generic container actions rather than duplicated in React components

### Requirement: Canvas schema preserves backward compatibility
The system SHALL introduce new layer fields as optional during migration. Existing Canvas files without `content`, `container`, preview capabilities, or endpoint objects MUST continue to load and render through legacy paths. Migrated presets MAY add `content`, `container`, `preview`, and endpoint metadata to newly created nodes while preserving the authoritative legacy-compatible `data` bag.

#### Scenario: Legacy node renders without content
- **WHEN** a v1 Canvas file contains a Shot node without `content`
- **THEN** the Webview renders it through the legacy Shot renderer and preserves its existing `data` bag

#### Scenario: Unknown future fields are preserved
- **WHEN** a Canvas file contains optional layer fields not used by the current renderer
- **THEN** load/save behavior preserves those fields unless an explicit migrator removes them

#### Scenario: New migrated node preserves legacy data shape
- **WHEN** the Webview creates a Shot, Scene, Gallery, or Media node through a migrated preset
- **THEN** the node contains the existing data fields required by legacy tools and generation flows in addition to any optional layer fields

#### Scenario: Rollback keeps files readable
- **WHEN** composable preset creation is disabled during rollback
- **THEN** existing legacy nodes continue to render and nodes that already contain `content` retain their `data` so repair or fallback workflows can inspect them
