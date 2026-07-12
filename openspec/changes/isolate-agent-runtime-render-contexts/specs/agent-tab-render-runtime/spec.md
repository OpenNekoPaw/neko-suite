## ADDED Requirements

### Requirement: Every open Webview Tab owns an independent render runtime
The Agent Webview SHALL create one `TabRenderRuntime` per open Tab binding. Each runtime MUST own an independent store and keyed React subtree for its conversation projection, input, attachments, references, model/config selection, generation parameters, prompt state, Markdown sessions, focus, scroll, composition, menus, queued edits, and diagnostics.

#### Scenario: Inputs remain independent during rapid switching
- **WHEN** the user types or composes text in Tab A while rapidly activating Tabs B and C
- **THEN** A's input and composition state MUST remain in A's render runtime
- **AND** B and C MUST NOT receive text, attachments, queued edits, or focus events from A

#### Scenario: Background Tab receives updates
- **WHEN** Tab A is hidden and its conversation continues streaming while Tab B is visible
- **THEN** A's independent store and component lifecycle MUST receive or retain A's projection updates
- **AND** B's rendered messages, Markdown, scroll, input, and configuration MUST remain unchanged

#### Scenario: Webview realm restores multiple open Tabs
- **WHEN** a new Webview realm receives bindings for multiple open Tabs
- **THEN** it SHALL reconcile all Tab runtimes before requesting historical conversation and settings snapshots
- **AND** it SHALL request each unique bound conversation at most once during that realm
- **AND** historical snapshot responses SHALL update only the named conversation cache without changing foreground activation
- **AND** ordinary Tab switching SHALL NOT repeat those restore requests

#### Scenario: Webview realm restores independent Tab drafts
- **WHEN** a Webview realm is recreated while multiple open Tabs own unsent composer text or future-turn configuration
- **THEN** each new Tab runtime SHALL restore only the draft whose `tabId` and `conversationId` both match its immutable binding
- **AND** typing or configuration changes in one Tab SHALL NOT overwrite another Tab's persisted draft
- **AND** projection, history, attachments, references, queued edits, focus, menus, diagnostics, and runtime handles SHALL NOT be persisted in host state
- **AND** an unknown draft schema or owner mismatch SHALL fail visibly rather than fall back to the active Tab

### Requirement: Tab activation changes visibility only
Activating a Tab SHALL change which keyed Tab subtree is visible. Activation MUST NOT copy save/restore state through a shared input component, rebind Agent runtime ownership, mutate conversation configuration, or flush, discard, attach, detach, or reset another Tab's projection channel.

#### Scenario: Switch during simultaneous streams
- **WHEN** conversations A and B stream concurrently and the user switches between their Tabs
- **THEN** only subtree visibility MUST change
- **AND** both render runtimes MUST preserve their own projection sequence, Markdown session, input, and scroll state

### Requirement: Render retention is bounded without state rebinding
The Webview MAY unmount a clean inactive historical Tab subtree under a bounded retention policy, but it MUST retain that Tab's independent store and authoritative projection replica. Running, attaching, composing, or dirty-input Tabs MUST remain retained until those conditions end.

#### Scenario: Historical Tab remount
- **WHEN** a clean historical Tab is unmounted for memory control and later activated
- **THEN** its subtree MUST remount from its own retained runtime state or a fresh attachment snapshot
- **AND** it MUST NOT restore by copying state from the previously visible Tab

### Requirement: Tab and conversation lifecycles remain distinct
A Tab SHALL be a disposable view binding and SHALL NOT own Agent execution or durable history. Multiple view bindings for the same conversation, if supported, MUST have independent render runtimes attached to one conversation runtime.

#### Scenario: Reopen running conversation
- **WHEN** a user closes and later reopens a Tab for a still-running conversation
- **THEN** the new Tab runtime MUST attach to that conversation's existing execution/projection authority
- **AND** closing the earlier Tab MUST NOT have cancelled or transferred ownership of the run

### Requirement: TUI application and session rendering are independently owned
Each TUI application root SHALL create an independent mutable application runtime. If a TUI root hosts multiple conversations, each conversation MUST have an independent session/render controller; switching visible content MUST NOT rebind a singleton mutable hook or store to another conversation.

#### Scenario: Two TUI application roots
- **WHEN** two TUI application roots run in the same process
- **THEN** their input, configuration, active run, projection, cancellation, and presentation state MUST be independent
- **AND** disposing one root MUST NOT clear or cancel the other
