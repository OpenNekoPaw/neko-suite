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
