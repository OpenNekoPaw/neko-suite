## ADDED Requirements

### Requirement: Composer excludes staged creation runtime controls

The Agent composer SHALL keep mode, model, reference, attachment, queue, execution approval, and send controls separate from Agent-native staged creation state. It SHALL NOT expose IDC or staged creation start/resume/stop controls under the input area or through a hidden display gate.

#### Scenario: Callback presence does not render staged creation controls
- **WHEN** the Webview has access to staged creation or legacy IDC control callbacks
- **THEN** the input composer SHALL NOT render start, resume, or stop staged creation buttons because those callbacks exist
- **AND** tests SHALL assert that no staged creation control group appears in normal Agent conversations.

#### Scenario: No explicit composer gate for IDC controls
- **WHEN** the InputArea props and ChatView props are compiled
- **THEN** they SHALL NOT include `showIdcWorkflowControls` or an equivalent explicit gate for IDC workflow-style controls
- **AND** staged creation UI SHALL be represented by projection components outside the composer toolbar.

#### Scenario: Stage status is projected outside input toolbar
- **WHEN** Agent-native staged creation is active
- **THEN** the UI SHALL present stage/profile/diagnostic/review information through conversation, status, artifact, or review surfaces
- **AND** the composer SHALL remain focused on message entry and turn-level runtime controls.
