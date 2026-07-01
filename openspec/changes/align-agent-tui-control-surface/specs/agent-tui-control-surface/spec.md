## ADDED Requirements

### Requirement: Terminal-native mode model and parameter controls
The Agent TUI SHALL expose terminal-native controls for session mode, execution mode, model selection, media model selection, and turn/session parameter configuration without depending on Webview GUI components.

#### Scenario: Execution mode can be changed from TUI
- **WHEN** the user invokes a TUI execution mode command or supported keyboard shortcut
- **THEN** the TUI SHALL update the Agent session execution mode to `plan`, `ask`, or `auto`
- **AND** the terminal status projection SHALL show the active execution mode.

#### Scenario: Session mode can be changed from TUI
- **WHEN** the user invokes `/mode agent`, `/mode image`, `/mode video`, or `/mode audio`
- **THEN** the TUI SHALL update the session mode used for subsequent sends
- **AND** it SHALL reject unsupported modes with a visible diagnostic.

#### Scenario: Model selection uses explicit identity
- **WHEN** the user lists or selects an LLM or media model from TUI
- **THEN** the TUI SHALL display and accept explicit provider/model identity when available
- **AND** it SHALL preserve the selected identity in the Agent send/configuration path instead of reducing it to an ambiguous model label.

#### Scenario: Parameter controls are validated
- **WHEN** the user sets LLM or media generation parameters from TUI
- **THEN** the TUI SHALL route normalized parameters through the existing Agent/provider capability validation path
- **AND** unsupported parameters SHALL produce a visible diagnostic instead of being silently ignored.

### Requirement: Trigger-specific terminal suggestions
The Agent TUI SHALL provide terminal suggestion behavior for `/`, `$`, and `@` trigger namespaces while preserving their distinct command, Skill, and reference semantics.

#### Scenario: Slash suggestions show commands
- **WHEN** the user types `/` at a valid TUI input boundary
- **THEN** the TUI SHALL show available builtin commands, host commands, plugin commands, and command artifacts
- **AND** it SHALL NOT include ordinary Skills that only belong to the `$` namespace.

#### Scenario: Skill suggestions show enabled Skills
- **WHEN** the user types `$` at a valid TUI input boundary
- **THEN** the TUI SHALL show enabled Skills visible to the current session
- **AND** selecting a Skill SHALL insert or dispatch a `$<skill-name>` invocation through the canonical Skill lifecycle path.

#### Scenario: Reference suggestions show terminal-safe references
- **WHEN** the user types `@` at a valid TUI input boundary
- **THEN** the TUI SHALL show terminal-safe file, asset, entity, or context reference candidates available to the current session
- **AND** selecting a candidate SHALL add a structured or textual reference for the next send without rendering thumbnails or Webview context chips.

#### Scenario: Unknown trigger target fails visibly
- **WHEN** the user submits an unknown `/` command, `$` Skill, or `@` reference
- **THEN** the TUI SHALL return a visible diagnostic
- **AND** it SHALL NOT silently send the malformed trigger as an ordinary chat prompt.

### Requirement: Direct status and compaction commands
The Agent TUI SHALL expose context token status through `/status` and context compaction through `/compact`.

#### Scenario: Context status is displayed
- **WHEN** the user invokes `/status`
- **THEN** the TUI SHALL display expanded active state including the current estimated context token count when the runtime supports it
- **AND** it SHALL display a visible diagnostic when the current session cannot provide a context token estimate.

#### Scenario: Context compaction runs through runtime
- **WHEN** the user invokes `/compact`
- **THEN** the TUI SHALL call the Agent runtime context compaction path
- **AND** it SHALL display the original token count, compressed token count, and compression ratio when available.

### Requirement: Running send cancellation and message queue controls
The Agent TUI SHALL align send, cancellation, and message queue behavior with the Agent runtime queue contract while presenting terminal-native controls.

#### Scenario: Normal send starts Agent turn
- **WHEN** the Agent is idle and the user submits a compatible prompt from TUI
- **THEN** the TUI SHALL add the user prompt to the terminal conversation projection
- **AND** it SHALL execute the Agent turn through the canonical Agent session/runtime path.

#### Scenario: Escape cancels active turn only
- **WHEN** the Agent is running and the user presses Escape in TUI
- **THEN** the TUI SHALL cancel the active Agent turn through the runtime cancellation path
- **AND** it SHALL NOT clear queued pending messages unless the user invokes an explicit queue command.

#### Scenario: Running text send enters queue
- **WHEN** the Agent is running and the user submits a queue-compatible text prompt from TUI
- **THEN** the TUI SHALL enqueue the prompt through the item-aware runtime message queue
- **AND** the queue item SHALL have a stable id that can be listed, promoted, cancelled, or edited.

#### Scenario: Queue commands mutate authoritative queue
- **WHEN** the user invokes `/queue list`, `/queue promote <id>`, `/queue cancel <id>`, or `/queue edit <id>`
- **THEN** the TUI SHALL operate on the authoritative runtime queue item for the current conversation
- **AND** stale or unknown queue ids SHALL produce visible diagnostics instead of no-op success.

#### Scenario: Non-queueable input is rejected while running
- **WHEN** the Agent is running and the user submits a command or payload that the queue contract does not support
- **THEN** the TUI SHALL reject it with a visible not-queueable diagnostic
- **AND** it SHALL NOT add it to the transcript or queue as if it succeeded.

### Requirement: Timeline-aware streaming and process output
The Agent TUI SHALL project streaming assistant text, thinking, tools, task progress, media progress, errors, and artifacts in runtime order with stable parent/reference identities.

#### Scenario: Streaming text remains ordered with tools
- **WHEN** an Agent turn emits text, a tool call, a tool result, and later text
- **THEN** the TUI SHALL display those items in emitted turn order
- **AND** later text SHALL NOT be merged above the tool call or tool result.

#### Scenario: Tool results update their tool identity
- **WHEN** a tool result, confirmation, failure, or backfill references a tool call id
- **THEN** the TUI SHALL display the update with the originating tool call identity
- **AND** it SHALL fail visibly for unknown required tool anchors.

#### Scenario: Task and media progress keeps parent identity
- **WHEN** a task or media progress event is associated with a parent tool call or turn
- **THEN** the TUI SHALL display task id, status, parent identity when present, and concise progress details
- **AND** it SHALL not infer placement from the last visible assistant line.

#### Scenario: Errors are anchored
- **WHEN** the runtime emits a tool-level, task-level, or turn-level error
- **THEN** the TUI SHALL display the error with its most specific known anchor
- **AND** it SHALL include a visible diagnostic when the anchor contract is invalid.

### Requirement: Reference-only artifact and media output
The Agent TUI SHALL display generated or referenced media/artifacts as stable terminal references, not rendered media previews.

#### Scenario: Image output displays references
- **WHEN** an Agent tool or task produces an image artifact for TUI display
- **THEN** the TUI SHALL display available stable fields such as `ResourceRef`, asset id, task id, media kind, dimensions, and workspace-relative path
- **AND** it SHALL NOT attempt to render the image inline.

#### Scenario: Video and audio output displays references
- **WHEN** an Agent tool or task produces video or audio output for TUI display
- **THEN** the TUI SHALL display available stable fields such as `ResourceRef`, asset id, task id, media kind, duration, codec/probe summary when available, and workspace-relative path
- **AND** it SHALL NOT attempt to play or preview the media inline.

#### Scenario: Webview runtime URLs are not durable references
- **WHEN** a tool result contains a Webview URI, blob URL, temporary absolute path, or runtime cache path
- **THEN** the TUI SHALL NOT present that value as the durable artifact identity
- **AND** it SHALL prefer stable `ResourceRef`, asset id, document resource ref, or workspace-relative path when available.

#### Scenario: Artifact commands expose follow-up actions
- **WHEN** an artifact or media reference is displayed in TUI
- **THEN** the TUI SHALL include or support follow-up commands such as `/artifact show <id>`, `/artifact open <id>`, or `/artifact send <target> <id>` when the corresponding runtime/host action is available
- **AND** unavailable actions SHALL be omitted or diagnosed visibly.

### Requirement: Terminal status projection summarizes active controls
The Agent TUI SHALL summarize active mode, model, media model, Skill lifecycle, queue, task, and context state in terminal-friendly status output.

#### Scenario: Status bar shows compact active state
- **WHEN** the TUI status bar is rendered
- **THEN** it SHALL show active execution mode, selected LLM model, configured media model summary, active Skill lifecycle summary when present, and token/context usage when available.

#### Scenario: Status command shows expanded active state
- **WHEN** the user invokes `/status`
- **THEN** the TUI SHALL display expanded active state including mode, model identity, media defaults/overrides, Agent status, token/context summary, active Skills, queue count, and running task summary when available.
