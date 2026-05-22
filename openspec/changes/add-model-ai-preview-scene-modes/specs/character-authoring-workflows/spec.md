## ADDED Requirements

### Requirement: AI Character Authoring Provides Preview Evaluation Modes
The system SHALL integrate AI character preview modes into character authoring workflows so generated characters can be evaluated through face, full-body, motion, and voice-pack scenes before export or use in animation.

#### Scenario: Generated character enters preview workflow
- **WHEN** an AI-generated character is loaded into Neko Model authoring
- **THEN** the character authoring UI exposes preview evaluation modes for face, full-body, motion, and voice-pack checks when the engine reports preview-mode capability

#### Scenario: Preview workflow does not replace editing commands
- **WHEN** the user edits morphs, materials, bones, IK, or expressions while a preview mode is active
- **THEN** those edits still compile to character or scene commands and reconcile through engine revisions rather than mutating only Webview-local state

### Requirement: AI Preview Modes Use Character Assets And Bindings
The system SHALL resolve preview mode content from character authoring assets, including skeleton, morphs, expression presets, animation clips, voice packs, viseme bindings, materials, and metadata. Missing or incompatible assets MUST be reported as preview diagnostics without corrupting character authoring data.

#### Scenario: Motion mode resolves compatible clips
- **WHEN** motion preview mode starts for a character with registered compatible demo animation clips
- **THEN** Engine selects the requested clip or a deterministic default clip and plays it against the character's authoritative rig bindings

#### Scenario: Voice mode resolves voice pack binding
- **WHEN** voice-pack preview mode starts for a character with a registered voice pack and compatible viseme bindings
- **THEN** Engine resolves the voice pack, audio stream, viseme timing, and expression mapping through character authoring metadata or AssetDatabase descriptors

#### Scenario: Preview leaves source assets immutable
- **WHEN** preview mode applies camera presets, lighting presets, demo clips, voice playback, or diagnostics
- **THEN** it does not mutate source template assets, imported files, or generated asset data unless the user performs an explicit authoring edit command

### Requirement: AI Preview State Participates In Character Undo Boundaries
The system SHALL keep preview mode selection and playback control separate from destructive character authoring edits. Undo and redo MUST operate on acknowledged character edits and MUST NOT replay transient preview mode selection as if it were a morph, material, skeleton, or asset edit.

#### Scenario: Undo skips preview selection
- **WHEN** the user switches preview modes and then undoes the last morph edit
- **THEN** Engine undoes the morph edit while leaving preview mode state governed by the active preview session policy

#### Scenario: Reset camera override is a viewport state operation
- **WHEN** the user resets a preview mode camera override
- **THEN** the operation updates preview viewport state and does not appear as a character geometry or material edit in the character undo history
