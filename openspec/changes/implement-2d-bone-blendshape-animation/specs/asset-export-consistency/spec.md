## ADDED Requirements

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
