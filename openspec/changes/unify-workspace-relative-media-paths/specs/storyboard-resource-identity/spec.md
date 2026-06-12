## ADDED Requirements

### Requirement: Storyboard local media refs use shared path semantics
Storyboard, Story, and Agent-to-Canvas payloads that include local media paths SHALL apply the shared workspace-relative media path contract when stable resource refs are not available.

#### Scenario: Storyboard shot references workspace image
- **WHEN** a storyboard shot references `cases/panel-01.png`
- **AND** the receiving Canvas document belongs to a workspace containing that file
- **THEN** Canvas resolves the reference against the receiving document's owning workspace context
- **AND** the saved Canvas data keeps the durable workspace-relative media ref rather than a runtime preview URL.

#### Scenario: Storyboard prefers stable resource ref over path fallback
- **WHEN** a storyboard shot contains both a stable resource reference and a local path fallback
- **THEN** consumers prefer the stable resource reference for durable identity
- **AND** the local path fallback is resolved through workspace-relative media path semantics only if the stable reference cannot be materialized.

#### Scenario: Story preview does not fabricate absolute roots
- **WHEN** Story or storyboard preview receives a local media path without a variable prefix
- **THEN** it resolves the path through the source document workspace context
- **AND** it does not fabricate `/cases/...` as an absolute filesystem path.
