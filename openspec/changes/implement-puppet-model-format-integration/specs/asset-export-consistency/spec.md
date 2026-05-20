## ADDED Requirements

### Requirement: Puppet Model Export Consistency
Puppet asset export SHALL create new output artifacts and SHALL NOT mutate original imported ZIP bundles or bundle-memory source entries.

#### Scenario: Export from bundle-memory source
- **WHEN** a puppet model was imported from a Live2D ZIP
- **THEN** exporting the model creates a new output package while the original ZIP remains unchanged

### Requirement: Model Asset Export Consistency
Model asset export SHALL preserve original model files and write edits, animation packages, or config packages as new artifacts.

#### Scenario: Export model motions
- **WHEN** a model animation dimension is exported
- **THEN** the system writes a new motion package or `.nkma` artifact without modifying the source `.glb`, `.gltf`, or `.vrm`

### Requirement: Character Pack Export Consistency
Character-pack export SHALL preserve asset references and generate a bundle package that can be imported or installed without requiring direct mutation of source assets.

#### Scenario: Export character pack
- **WHEN** a user exports a character pack from bound puppet/model assets
- **THEN** the output contains a bundle manifest and referenced subpackages or copied artifacts sufficient for local share or market upload
