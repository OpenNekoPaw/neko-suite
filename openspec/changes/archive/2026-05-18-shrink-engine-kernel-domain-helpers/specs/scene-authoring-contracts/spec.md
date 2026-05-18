## ADDED Requirements

### Requirement: Scene Authoring Includes Runtime Text Mesh Generation
Scene authoring SHALL include runtime-owned 3D text mesh generation that converts text parameters into procedural scene mesh data without kernel implementation ownership.

#### Scenario: Text mesh generation is a scene authoring operation
- **WHEN** a caller requests creation of a text mesh scene object
- **THEN** scene authoring treats it as a procedural mesh generation operation owned by `runtime-scene`
- **THEN** kernel service orchestration only validates, delegates, and inserts the generated mesh into scene state

#### Scenario: Text mesh output uses scene procedural mesh contracts
- **WHEN** text mesh generation succeeds
- **THEN** the output is represented as `runtime-scene` procedural mesh data
- **THEN** no GPU resource, kernel domain object, or host transport object is required to represent the generated mesh
