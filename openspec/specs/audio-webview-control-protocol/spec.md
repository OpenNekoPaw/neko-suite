# audio-webview-control-protocol Specification

## Purpose
Defines the typed `audio:*` Webview-to-Extension control protocol while keeping
binary audio frames on direct Engine-to-Webview streaming paths.
## Requirements
### Requirement: Webview runtime audio actions use unified audio control messages
The system SHALL route Webview runtime audio commands through typed `audio:*` request messages. New playback, trim, effects, analysis, export, and recording flows MUST use the unified namespace instead of adding new `editor:*` or `project:mix*` message types.

#### Scenario: User starts playback
- **WHEN** a user starts playback from Webview
- **THEN** Webview sends `audio:playback` with action `play` to Extension

#### Scenario: User exports project audio
- **WHEN** a user requests project audio export
- **THEN** Webview sends `audio:export` with output options and not a project render config

### Requirement: Extension is the routing decision point for audio user commands
The system SHALL route `audio:*` requests in Extension according to current mode and project context. Webview MUST NOT decide whether a command should call single-file stream, project mix stream, transcode, or mix export by constructing Engine requests directly.

#### Scenario: Playback route depends on mode
- **WHEN** Extension receives `audio:playback` with action `play`
- **THEN** Extension routes single-file playback to `audios:stream` and project playback to `audios:mix_stream` with Extension-built config

#### Scenario: Export route depends on mode
- **WHEN** Extension receives `audio:export`
- **THEN** Extension routes single-file export to transcode and project export to mix export with Extension-built config

### Requirement: Audio response messages are typed DTOs
The system SHALL define serializable audio response messages for playback, trim, effects, analysis, export, and recording results. Responses MUST be safe to pass over VSCode Webview `postMessage`.

#### Scenario: Playback returns stream connection data
- **WHEN** Extension starts a stream successfully
- **THEN** it sends `audio:playbackReady` with `streamId` and `wsUrl`

#### Scenario: Export returns warnings
- **WHEN** project export completes with non-fatal mix warnings
- **THEN** Extension sends an export result that includes the output path and warnings

### Requirement: Audio data plane bypasses Extension
The system SHALL keep PCM stream frames on the direct Engine-to-Webview WebSocket data plane. Extension MUST only orchestrate stream creation and control commands, not proxy binary audio frames.

#### Scenario: Webview connects directly to Engine stream
- **WHEN** Extension sends `audio:playbackReady`
- **THEN** Webview creates an audio stream client using the returned WebSocket URL and receives PCM frames directly from Engine

#### Scenario: Pause command remains control plane
- **WHEN** user pauses playback
- **THEN** Webview sends an `audio:playback` control message and Extension sends the corresponding Engine stream control request

### Requirement: Legacy audio runtime controls are removed
The system SHALL remove old audio runtime control handlers in favor of `audio:*` because this foundation has not shipped. `project:init`, `project:sync`, `operationApplied`, `project:importAudio`, and `project:dropImportAudio` are project state/edit messages and MUST remain distinct from the runtime control namespace.

#### Scenario: Legacy play message is rejected
- **WHEN** an unmigrated Webview path sends a legacy playback message during P0
- **THEN** Extension does not route it through a compatibility playback path

#### Scenario: Project import stays project-edit namespace
- **WHEN** Webview requests audio import into a `.nka` project
- **THEN** it uses `project:importAudio` or `project:dropImportAudio`, and Extension performs the project edit without exposing an `audio:import` runtime command

### Requirement: Audio message DTOs remain serializable and layer-safe
The system SHALL define audio message DTOs in shared code without importing Webview, React, VSCode, or Extension-only gateway types. Extension-only service ports MUST live in Extension code.

#### Scenario: Webview imports audio messages
- **WHEN** Webview imports shared audio request and response message types
- **THEN** it receives serializable DTO types and no VSCode API dependency

#### Scenario: Extension gateway remains outside shared DTO module
- **WHEN** Extension implements project session resolution for Agent tools
- **THEN** the gateway interface is defined in Extension code rather than in the shared audio message DTO module

### Requirement: Project sync notifications are distinct from audio user actions
The system SHALL use `project:sync` notifications for Extension-to-Webview project state replacement after Agent edits, reloads, or reverts. These notifications MUST NOT be modeled as user `audio:*` requests.

#### Scenario: Agent edit sync notification
- **WHEN** Agent changes project data in Extension
- **THEN** Extension sends `project:sync` to the targeted Webview rather than an `audio:*` request

#### Scenario: Webview handles sync as state replacement
- **WHEN** Webview receives `project:sync`
- **THEN** it replaces local project state from the payload and does not route the message through playback/export handlers

### Requirement: Recording controls use the unified protocol
The system SHALL route input device listing, recording start, and recording stop through the unified `audio:recording` message type while preserving Engine recording actions.

#### Scenario: List input devices
- **WHEN** Webview requests available recording devices
- **THEN** it sends `audio:recording` with action `listDevices` and Extension calls the Engine device listing action

#### Scenario: Stop recording
- **WHEN** Webview stops an active recording
- **THEN** it sends `audio:recording` with action `stop` and the active stream ID
