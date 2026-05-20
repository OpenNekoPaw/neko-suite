## ADDED Requirements

### Requirement: Character Asset Dimensions
The system SHALL represent puppet/model character assets as independent dimensions for model, motion, config, audio, and text where applicable.

#### Scenario: Live2D bundle dimensions
- **WHEN** a Live2D bundle is imported
- **THEN** AssetLibrary records model, motion, and config dimensions with media kinds such as `puppet-model`, `puppet-motion`, and `puppet-config`

#### Scenario: 3D model dimensions
- **WHEN** a `.glb`, `.gltf`, `.vrm`, or `.nkm` asset is imported or registered
- **THEN** AssetLibrary can record model, motion, and config dimensions with media kinds such as `model-3d`, `model-motion`, and `model-config`

### Requirement: Bundle-Memory Asset Files
The system SHALL support AssetLibrary file records that identify bundle-memory entries without requiring a physical file for each dimension.

#### Scenario: Bundle-memory file record
- **WHEN** a Live2D bundle motion group is registered
- **THEN** the AssetLibrary file record stores `storageMode: "bundle-memory"` and a bundle locator or bundle metadata identifying the ZIP entry group

#### Scenario: Disk file record
- **WHEN** a 3D glTF ZIP is extracted
- **THEN** the AssetLibrary file record stores `storageMode: "disk"` and a path to the extracted runtime asset

### Requirement: Asset Dimension Metadata Is Searchable
The system SHALL expose asset dimension metadata through ProjectSearch results without Search owning domain parsing.

#### Scenario: Search model dimension
- **WHEN** Agent searches for character model assets
- **THEN** ProjectSearch can return matching AssetLibrary items with `assetDimension: "model"` and the appropriate media kind

#### Scenario: Search motion dimension
- **WHEN** Agent searches for puppet motions
- **THEN** ProjectSearch can return matching motion dimension items from AssetLibrary metadata
