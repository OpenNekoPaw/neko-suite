## MODIFIED Requirements

### Requirement: Unified composer mode configuration
The Agent composer SHALL present a single mode/configuration control model where the left control selects the active creative mode and the right side renders independent dropdown chips for each configurable value of that active mode. Execution mode SHALL remain a runtime control and SHALL NOT imply hidden IDC workflow or Skill activation.

#### Scenario: Agent mode configuration chips are visible
- **WHEN** the active session mode is `agent`
- **THEN** the composer shows `Agent` as the selected mode
- **AND** the configuration area separates model configuration from Agent behavior parameters
- **AND** the primary LLM model, available image/video/audio generation model slots, reasoning preset, verbosity preset, and creativity preset are independently configurable dropdowns

#### Scenario: Media mode configuration chips are visible
- **WHEN** the active session mode is `image`, `video`, or `audio`
- **THEN** the composer shows the selected media mode
- **AND** the configuration area shows the selected media model and relevant generation parameters as independent dropdowns

#### Scenario: Switching modes updates active configuration
- **WHEN** the user changes the active composer mode
- **THEN** the configuration chips reflect the newly selected mode without showing stale controls from the previous mode

#### Scenario: Execution mode stays with runtime controls
- **WHEN** the active session mode is `agent`
- **THEN** the execution approval mode remains in the bottom runtime toolbar near send/tool controls
- **AND** it is not grouped with model configuration or Agent behavior parameter chips
- **AND** changing execution approval mode SHALL NOT start IDC, enter an IDC stage, activate a Skill, or activate stage persona records by itself

#### Scenario: Execution mode change is explicit
- **WHEN** the user changes execution mode to `plan`, `ask`, or `auto`
- **THEN** the Webview SHALL send an explicit settings or activation message
- **AND** the Extension SHALL apply the mode change as a visible user-explicit action.

#### Scenario: Agent-requested mode change is visible
- **WHEN** the Agent requests an execution mode change through a typed tool
- **THEN** the runtime SHALL surface the request and result to UI
- **AND** it SHALL NOT silently mutate mode state through hidden defaults.
