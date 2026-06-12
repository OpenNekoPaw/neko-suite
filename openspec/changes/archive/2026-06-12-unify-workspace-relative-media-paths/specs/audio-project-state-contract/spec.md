## ADDED Requirements

### Requirement: Audio project media paths use workspace-relative semantics
Audio project load, save, probe, and playback flows SHALL apply the shared workspace-relative media path contract to audio element source paths.

#### Scenario: Audio project saves workspace media as relative path
- **WHEN** an `.nka` project owned by `/work/project` references `/work/project/cases/music.aac`
- **THEN** save normalization writes `cases/music.aac`
- **AND** it does not persist a Webview URL, engine token, or absolute path as the canonical source.

#### Scenario: Audio playback resolves before engine call
- **WHEN** an audio element source is `cases/music.aac`
- **AND** playback or probe is requested after reopening the project
- **THEN** the Extension Host resolves it against the owning workspace context
- **AND** engine-facing playback receives an existing local file or explicit unresolved-source error.

#### Scenario: External audio path contracts to variable
- **WHEN** an audio source is outside the owning workspace but inside a configured media-library root
- **THEN** save normalization uses the configured variable form
- **AND** reopen playback expands that variable before probing or playback.
