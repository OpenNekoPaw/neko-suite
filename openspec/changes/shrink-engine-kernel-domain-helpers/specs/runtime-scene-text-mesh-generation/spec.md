## ADDED Requirements

### Requirement: Runtime Scene Owns Text Mesh Generation
`runtime-scene` SHALL own 3D text mesh generation because it produces scene procedural mesh data and belongs to scene authoring domain logic.

#### Scenario: Scene service creates text mesh through runtime-scene
- **WHEN** `SceneService::create_text_mesh` receives valid text mesh parameters
- **THEN** it invokes text mesh generation from `runtime-scene`
- **THEN** it inserts the resulting `ProceduralMesh` into the scene using existing scene authoring behavior

#### Scenario: Kernel does not implement text mesh generation
- **WHEN** architecture tests inspect `engine-kernel/src`
- **THEN** no text mesh generator implementation module exists under kernel

### Requirement: Text Mesh Parameter Compatibility
Text mesh generation migration SHALL preserve the existing JSON parameter shape accepted by scene service callers.

#### Scenario: Existing text mesh request still deserializes
- **WHEN** a caller sends the same text mesh JSON parameters accepted before migration
- **THEN** the request deserializes into the runtime-scene text mesh parameter type
- **THEN** the scene service returns the same category of `SceneSnapshot` result

#### Scenario: Invalid text mesh request returns typed service error
- **WHEN** text mesh parameters are invalid or font shaping fails
- **THEN** the scene service returns a typed kernel error mapped from runtime-scene generation error
- **THEN** it does not panic

### Requirement: Text Mesh Tests Live With Scene Runtime
Text mesh generation unit tests SHALL live in `runtime-scene` so the generation algorithm is tested without kernel service orchestration.

#### Scenario: Runtime scene tests cover text mesh
- **WHEN** runtime-scene tests run
- **THEN** they cover basic text mesh generation, empty text behavior, layout constraints, and error cases formerly covered by kernel generator tests
