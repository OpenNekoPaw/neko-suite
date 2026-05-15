## ADDED Requirements

### Requirement: Scene Blend Contracts Use Shared Animation DTOs
Scene authoring contracts SHALL reuse shared runtime animation blend DTOs for common blend and crossfade state while preserving scene-specific behavior.

#### Scenario: Scene blend state exposes compatible data
- **WHEN** scene services return animation blend state
- **THEN** the returned data remains compatible with existing scene callers
- **THEN** internally common blend layer and crossfade concepts come from the shared animation contract or a compatibility wrapper over it

#### Scenario: Scene-only playback state remains scene-owned
- **WHEN** scene animation exposes playback state that has no puppet equivalent
- **THEN** that state remains in runtime-scene
- **THEN** the shared animation contract is not expanded solely for scene-only data
