## ADDED Requirements

### Requirement: Storyboard composite blocks support semantic storyboard tables
The system SHALL support `storyboard-table` composite blocks that carry validated `StoryboardTableV1` semantic data in addition to legacy section-based rich content. When semantic data is present and valid, rich rendering and downstream projection MUST prefer the semantic storyboard table while retaining legacy display compatibility during migration.

#### Scenario: Semantic storyboard table is extracted from composite content
- **WHEN** an assistant response contains a `neko-composite` fenced JSON block with template `storyboard-table` and valid `StoryboardTableV1` fields
- **THEN** the message model preserves the semantic storyboard table for validation, rendering, and downstream projection

#### Scenario: Invalid semantic storyboard renders diagnostics
- **WHEN** a `storyboard-table` composite block has schema errors that block projection
- **THEN** the Webview renders a bounded diagnostic state and does not expose executable Canvas/Cut send-to actions for that block

#### Scenario: Legacy storyboard sections remain renderable
- **WHEN** an assistant response contains an existing section-based `storyboard-table` composite block
- **THEN** the Webview continues to render the legacy rows and attempts compatibility normalization without requiring immediate v1 adoption

#### Scenario: Semantic projection takes precedence over inferred projection
- **WHEN** a `storyboard-table` block has valid semantic scenes and shots plus legacy sections
- **THEN** Canvas/Cut projectors use the semantic `StoryboardTableV1` data rather than inferring shots from display sections

### Requirement: Storyboard composite diagnostics do not leak runtime resources
The system SHALL show storyboard validation, media resolution, and provider availability diagnostics without persisting host-only render URIs, blob URLs, inline base64, or absolute local paths in composite content.

#### Scenario: Missing provider diagnostic is displayed
- **WHEN** a valid storyboard table requires an unavailable provider
- **THEN** the Webview displays a missing capability diagnostic and keeps the storyboard plan visible

#### Scenario: Unsafe media ref is blocked from rendering
- **WHEN** a storyboard media ref contains runtime-only or unsafe resource data
- **THEN** the presenter excludes that resource from rendering and displays a bounded diagnostic instead of crashing
