## ADDED Requirements

### Requirement: Extension-originated audio user commands target the focused panel

The system SHALL route Extension-originated audio user commands to one focused audio Webview panel rather than broadcasting them to every active audio panel.

#### Scenario: User runs audio command with focused audio editor

- **WHEN** the user invokes an audio command such as record, denoise, normalize, spectrum, trim, fade, or export and a focused audio Webview can be resolved
- **THEN** Extension Host sends the command only to that focused Webview

#### Scenario: Multiple audio panels are open

- **WHEN** multiple audio file or audio project panels are open
- **THEN** Extension Host does not send a user command to non-focused active panels

#### Scenario: Audio state notification is broadcast

- **WHEN** Extension Host sends a non-user state notification such as config, locale, project sync, or task progress
- **THEN** it may broadcast the notification to registered audio Webviews when the message is explicitly non-mutating or scoped by document URI
