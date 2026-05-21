## ADDED Requirements

### Requirement: Agent can set track automation through Extension
The system SHALL expose a `SetTrackAutomation` audio Agent tool that executes in Extension through `AudioToolBridge`. The tool MUST resolve the target audio project session, validate track and target identity, apply a typed project operation, mark the document dirty, and sync the targeted Webview.

#### Scenario: Agent sets track volume automation
- **WHEN** Agent calls `SetTrackAutomation` with a valid track ID, `track-volume` target, and valid points
- **THEN** Extension applies `track.mix.setAutomation` to the cached project data and returns success only after the edit is applied

#### Scenario: Agent invalid automation target fails honestly
- **WHEN** Agent calls `SetTrackAutomation` for a missing track, missing effect ID, unsupported parameter, out-of-range value, or invalid tick
- **THEN** the tool returns `{ success: false, error }` and does not mark the project dirty

### Requirement: Agent automation tool uses musical tick coordinates
The system SHALL require Agent automation inputs to use tick coordinates rather than raw seconds. Tool results MAY include document context and normalized point summaries so subsequent Agent calls can target the same project consistently.

#### Scenario: Agent tool schema accepts ticks
- **WHEN** Agent inspects the `SetTrackAutomation` schema
- **THEN** automation points are expressed with `ticks`, `value`, and optional `curve`

#### Scenario: Agent seconds input is rejected
- **WHEN** Agent attempts to send automation points with seconds-only timing
- **THEN** the tool validation fails with an error explaining that ticks are required
