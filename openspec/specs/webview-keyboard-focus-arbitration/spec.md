# webview-keyboard-focus-arbitration Specification

## Purpose
Define the shared Webview keyboard focus, editable target, IME composition, shortcut ownership, and focused panel routing contract for Neko Suite editors.

## Requirements
### Requirement: Structured shortcut declarations

The system SHALL declare Webview shortcuts with structured key specs instead of ambiguous shortcut strings.

#### Scenario: Package declares primary modifier shortcut

- **WHEN** a Webview package declares a shortcut for undo
- **THEN** it uses a structured key spec with key `KeyZ` and `primary: true`

#### Scenario: VSCode keybinding string is imported

- **WHEN** a package needs to convert a VSCode keybinding string into a Webview shortcut
- **THEN** it uses an explicit parser that returns the structured key spec

### Requirement: Editable and IME input guard

The system SHALL prevent editor-level shortcuts from firing while the active event target is editable or an IME composition is in progress.

#### Scenario: User types in a node text input

- **WHEN** the focused target is an input, textarea, select, contenteditable element, role textbox, or `data-neko-keyboard-scope="text-input"` element
- **THEN** editor-level shortcuts such as Delete, Space, Cmd/Ctrl+A, undo, redo, copy, paste, and tool switching do not run

#### Scenario: User confirms IME composition

- **WHEN** a key event has `isComposing` or keyCode `229`
- **THEN** the shortcut dispatcher does not run editor-level actions

### Requirement: Keyboard scope ownership and conflict resolution

The system SHALL resolve duplicate shortcut keys by keyboard boundary ownership, scope priority, and explicit same-level priority.

#### Scenario: Node and editor both bind Delete

- **WHEN** the event target is inside a node keyboard boundary and both node and editor scopes bind Delete
- **THEN** the node scope is evaluated before the editor fallback

#### Scenario: Editable guard rejects a shortcut

- **WHEN** the event target is editable or composing and an outer editor scope also binds the same key
- **THEN** dispatch stops and does not fall through to the outer editor scope

#### Scenario: Duplicate shortcut is registered in one scope

- **WHEN** a single owner and scope registers the same structured key spec more than once
- **THEN** development-mode validation fails with a duplicate shortcut diagnostic

### Requirement: Focused Webview routing

The system SHALL route Extension-originated user keyboard actions to one focused Webview panel.

#### Scenario: Active visible panel exists

- **WHEN** two Webviews of the same view type are visible and one panel is active
- **THEN** Extension Host sends the user keyboard action only to the active visible panel

#### Scenario: Command specifies document URI

- **WHEN** a command includes a target document URI
- **THEN** Extension Host routes the action to the panel registered for that document URI rather than the most recently created panel

#### Scenario: No focused target exists

- **WHEN** no focused panel can be resolved and visible fallback is not allowed
- **THEN** Extension Host does not post the keyboard action and reports command delivery failure to the command entrypoint

### Requirement: Focused panel feedback

The system SHALL notify visible Webviews when they gain or lose keyboard focus ownership.

#### Scenario: Side-by-side focus changes

- **WHEN** the user switches focus between two visible editor panels
- **THEN** the newly focused Webview receives `keyboardFocus` with `focused: true` and the previously focused Webview receives `focused: false`

#### Scenario: Unfocused panel receives user action

- **WHEN** an unfocused visible Webview receives a stale keyboard action message
- **THEN** it ignores the user action rather than mutating editor state
