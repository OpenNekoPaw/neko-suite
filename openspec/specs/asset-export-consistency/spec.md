# asset-export-consistency Specification

## Purpose
TBD - created by archiving change implement-3d-editor-wysiwyg-rendering. Update Purpose after archive.
## Requirements
### Requirement: AssetDatabase is the authoring asset truth
The system SHALL introduce a minimal `AssetDatabase` for 3D authoring assets. The database MUST own stable `AssetHandle` identifiers, metadata, import settings, versions, and descriptors for materials, meshes, and textures. ECS components MUST reference assets by handle and MUST NOT store GPU buffers, textures, bind groups, or other backend resource objects as authoring data.

#### Scenario: Material component references descriptor
- **WHEN** a node uses a material
- **THEN** its ECS component references a material handle whose descriptor is stored in `AssetDatabase`

#### Scenario: GPU cache is derived
- **WHEN** Engine uploads a texture to GPU
- **THEN** the resulting GPU resource is stored in derived cache/runtime state and not in authoring ECS components

### Requirement: Exporter reads AssetDatabase and ECS authoring data
The GLB/VRM exporter SHALL read material, texture, light, camera, visibility, hierarchy, transform, animation, and asset reference metadata from `AssetDatabase` plus ECS authoring components. The exporter MUST NOT read authoring metadata from GPU `AssetCache`, Render World, or hardcoded default material values except when a descriptor is explicitly missing.

#### Scenario: PBR material factors are exported
- **WHEN** a material descriptor contains base color, metallic, roughness, emissive, and texture references
- **THEN** GLB export writes the corresponding PBR factors and texture references into the output

#### Scenario: Exporter does not read GPU cache
- **WHEN** exporting a scene after GPU resources have been created
- **THEN** the exporter obtains material metadata through asset handles and descriptors, not through GPU buffers or bind groups

### Requirement: Lights and cameras are exported
The exporter SHALL write supported light and camera components into GLB output. Lights MUST use `KHR_lights_punctual` where applicable, and camera nodes MUST preserve camera identity, transforms, and projection parameters supported by the target format.

#### Scenario: Directional light is exported
- **WHEN** a scene contains a visible directional light component
- **THEN** GLB export includes the light through `KHR_lights_punctual` and attaches it to the corresponding node

#### Scenario: Active camera is exported
- **WHEN** a scene contains a camera component with projection settings
- **THEN** GLB export includes a camera node preserving its transform and supported projection fields

### Requirement: Visibility export modes are explicit
The exporter SHALL support mutually exclusive visibility modes: `prune`, `extras-flag`, and `preserve-all`. The default mode MUST be `prune`. Project files such as `.nkm` and future `.nkc` serialization MUST preserve visibility metadata independently of GLB visibility export mode.

#### Scenario: Default prune removes hidden nodes
- **WHEN** exporting with default visibility settings and a node has `Visible=false`
- **THEN** the node and its subtree are omitted from the GLB output

#### Scenario: Extras flag preserves hidden nodes for neko roundtrip
- **WHEN** exporting with `visibility='extras-flag'`
- **THEN** hidden nodes remain in the GLB and include `node.extras.visible = false`

#### Scenario: Preserve all ignores visibility for debug
- **WHEN** exporting with `visibility='preserve-all'`
- **THEN** all nodes are exported and no custom visibility extras are required

### Requirement: Animation export uses Engine playback state
The system SHALL store animation playback state, clip selection, time cursor, blend state, and evaluated pose in Engine-managed scene state. Export and capture paths MUST use Engine playback state rather than Webview R3F `AnimationMixer` state.

#### Scenario: Current animation pose is exported
- **WHEN** Webview has played or scrubbed an animation through Engine scene commands
- **THEN** export evaluates the pose from Engine scene state and does not fall back to T-pose because the Webview mixer advanced independently

### Requirement: Authoring asset writes are command-driven
The system SHALL update asset bindings and material parameters through scene or asset commands such as `asset:bind`, `asset:update`, or `material:update`. Engine-kernel GPU systems MUST NOT mutate AssetDatabase authoring descriptors directly.

#### Scenario: Inspector material edit writes descriptor through command
- **WHEN** the user changes roughness in Inspector
- **THEN** Webview sends a typed command, Engine updates the MaterialDescriptor, marks material dirty, and the GPU cache updates from the dirty descriptor

### Requirement: Asset export and package flows use source intent
The system SHALL resolve asset export, package, bundle, dependency validation, and artifact hashing inputs through source-first content access intents.

#### Scenario: Character pack copies original asset file
- **WHEN** a character pack export includes a bound asset file with a generated thumbnail
- **THEN** the export reads the original asset file or package source
- **THEN** it does not copy the thumbnail or preview cache artifact as the asset file

#### Scenario: Dependency validation hashes original import source
- **WHEN** dependency validation verifies an imported asset source hash
- **THEN** it reads the original source recorded by the asset dependency manifest
- **THEN** it ignores resource cache variants and generated preview artifacts

### Requirement: Draft or proxy export is explicit
The system SHALL require an explicit draft or proxy quality mode before using proxy media, preview variants, or downsampled derived artifacts as export inputs.

#### Scenario: Default export excludes proxy
- **WHEN** a media asset has a ready video proxy and a final export starts without draft/proxy mode
- **THEN** the export reads the original media source
- **THEN** it does not use the proxy path

#### Scenario: Draft proxy export records quality mode
- **WHEN** a user explicitly chooses draft/proxy export
- **THEN** the export request records that quality mode
- **THEN** the output diagnostics identify that proxy or derived media was used intentionally

### Requirement: Legacy cache paths are not package sources
The system SHALL NOT treat legacy `cachePath` values as original package or export sources.

#### Scenario: Legacy-only image cannot package
- **WHEN** an asset, storyboard, or document image record contains only a legacy cache path and no source ref
- **THEN** package/export reports missing-source or unrecoverable
- **THEN** it does not include the cache file as an original asset

### Requirement: Native Puppet Export Consistency
Native puppet export SHALL create new output artifacts and SHALL NOT mutate original PSD, PNG, Live2D ZIP, or MOC3 import sources.

#### Scenario: Export converted Live2D puppet
- **WHEN** a native puppet converted from Live2D is exported
- **THEN** the export writes native `.nkp` or package artifacts while leaving the original Live2D bundle unchanged

#### Scenario: Export records source metadata
- **WHEN** export includes source provenance
- **THEN** it records source metadata as references or hashes without rewriting source assets

### Requirement: Native Puppet Game And Video Exports
The system SHALL support export planning for native puppet outputs such as Spine JSON, spritesheets, Lottie-compatible animation, and character-pack assets.

#### Scenario: Export Spine-compatible data
- **WHEN** a native puppet with skeleton, meshes, skin weights, and animations is exported to Spine JSON
- **THEN** the output uses native skeleton and animation data rather than reconstructing data from MOC3 parameters

#### Scenario: Export spritesheet fallback
- **WHEN** a target cannot consume skeleton or BlendShape data
- **THEN** export can bake native puppet animation into spritesheet frames without mutating the source puppet

### Requirement: Native Entity Export Versioning
`.nkentity` export SHALL version native puppet entity artifacts and preserve migration from v1 entity artifacts.

#### Scenario: Export nkentity v2
- **WHEN** a character has a native puppet binding
- **THEN** entity export writes `.nkentity` v2 with native puppet binding metadata and a schema version accepted by the shared guard

#### Scenario: v1 entity remains readable
- **WHEN** an existing `.nkentity` v1 file is loaded
- **THEN** the loader preserves existing bindings and can migrate or adapt them without requiring native puppet fields

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
