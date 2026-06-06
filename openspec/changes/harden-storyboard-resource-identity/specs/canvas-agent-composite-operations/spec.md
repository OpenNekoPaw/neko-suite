## ADDED Requirements

### Requirement: Canvas storyboard imports resolve media through content access
Canvas SHALL resolve Agent-imported storyboard reference images through stable resource references and the intent-aware content access service before using legacy path projection.

#### Scenario: Imported shot has referenceResourceRef
- **WHEN** Canvas imports a storyboard shot containing `referenceResourceRef`
- **THEN** Canvas requests `interactive-preview` content for the appropriate image role
- **THEN** Canvas stores the stable reference and uses only the resolved runtime URI for display

#### Scenario: Imported shot has both ref and path
- **WHEN** Canvas imports a storyboard shot containing both a stable reference and `referenceImagePath`
- **THEN** Canvas prefers the stable reference for preview and persistence
- **THEN** the saved node omits the runtime or cache path when the stable reference is valid

### Requirement: Canvas legacy path fallback is explicit
Canvas SHALL treat legacy document cache paths as migration fallback and SHALL surface unresolved or migration status when those paths cannot be projected.

#### Scenario: Legacy path fallback succeeds
- **WHEN** an existing Canvas node has only a legacy cache path and the file still exists under an authorized legacy root
- **THEN** Canvas MAY project the path for display
- **THEN** Canvas keeps the path marked as legacy fallback rather than stable identity

#### Scenario: Legacy path fallback fails
- **WHEN** an existing Canvas node has only a legacy cache path and the file is missing or unauthorized
- **THEN** Canvas displays an unavailable document resource state
- **THEN** it does not reuse a previous thumbnail or sequential image

### Requirement: Canvas save strips runtime storyboard image handles
Canvas SHALL strip runtime storyboard image handles from persisted node data when stable references are present.

#### Scenario: Save after preview materialization
- **WHEN** a storyboard shot preview has materialized through resource cache
- **THEN** Canvas saves the stable reference fields
- **THEN** Canvas does not save `runtimeReferenceImagePath`, projected Webview URI, object URL, blob URL, or materialized cache path as durable data
