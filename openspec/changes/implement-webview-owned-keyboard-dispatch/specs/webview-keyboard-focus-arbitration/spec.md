## ADDED Requirements

### Requirement: Webview-owned editing shortcut dispatch
The system SHALL handle editor-internal editing shortcuts inside the Webview that owns DOM keyboard focus rather than through VSCode global keybinding contributions.

#### Scenario: Canvas handles delete inside focused Webview
- **WHEN** a Canvas Webview has keyboard focus and the user presses Delete while the focused target is the viewport or a selected node/container boundary
- **THEN** the Canvas Webview dispatcher runs the Canvas delete selection action without requiring a VSCode `contributes.keybindings` entry for Delete

#### Scenario: Canvas text input owns select all
- **WHEN** a Canvas node, container, or prompt input has DOM focus and the user presses Cmd/Ctrl+A
- **THEN** the input selects its text and Canvas does not run editor-level select-all

#### Scenario: Canvas input owns delete
- **WHEN** a Canvas node, container, or prompt input has DOM focus and the user presses Delete or Backspace
- **THEN** the input edits its text and Canvas does not delete the selected node/container

#### Scenario: Canvas input owns space
- **WHEN** a Canvas node, container, or prompt input has DOM focus and the user presses Space
- **THEN** the input inserts or handles a space and Canvas does not enter viewport pan mode

#### Scenario: Model handles viewport shortcuts inside focused Webview
- **WHEN** a Model Webview has keyboard focus and the focused target is its viewport
- **THEN** the Model Webview dispatcher handles editor-level viewport shortcuts without requiring VSCode `contributes.keybindings` entries for those shortcuts

### Requirement: Editing keybindings are removed from package manifests after Webview dispatch
The system SHALL remove VSCode contributed keybindings for Canvas and Model editor-internal editing shortcuts once the matching Webview-owned dispatcher and regression tests are in place.

#### Scenario: Canvas manifest no longer contributes editing shortcuts
- **WHEN** Canvas Webview-owned keyboard dispatch is enabled
- **THEN** `neko-canvas/package.json` does not contribute keybindings for Delete, Backspace, Escape, Cmd/Ctrl+A, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, or Cmd/Ctrl+G editor-internal Canvas actions

#### Scenario: Model manifest no longer contributes editing shortcuts
- **WHEN** Model Webview-owned keyboard dispatch is enabled
- **THEN** `neko-model/package.json` does not contribute keybindings for Delete, Backspace, Escape, Cmd/Ctrl+A, Cmd/Ctrl+Z, or Cmd/Ctrl+Shift+Z editor-internal Model actions

#### Scenario: Commands remain available for explicit entrypoints
- **WHEN** Canvas or Model editing keybindings are removed from package manifests
- **THEN** the corresponding VSCode command declarations and command handlers remain available for menus, command palette, Outline, StatusBar, and plugin integrations

### Requirement: Transition editable owner guard has exit criteria
The system SHALL treat the global Webview editable owner context as transition infrastructure and keep it removable after editing shortcuts migrate to Webview-owned dispatch.

#### Scenario: Transition guard remains while manifests contribute editing shortcuts
- **WHEN** any package still contributes VSCode global keybindings for Webview editor-internal editing shortcuts
- **THEN** the package SHALL keep using the global editable owner context or an equivalent guard to prevent cross-Webview input conflicts

#### Scenario: Transition guard is no longer a primary dispatch dependency
- **WHEN** Canvas and Model no longer contribute VSCode global keybindings for editor-internal editing shortcuts
- **THEN** Canvas and Model Webview editing shortcut behavior does not depend on `neko.webview.keyboardEditable` or `neko.webviewKeyboard.hasEditableOwner`

#### Scenario: Owner aggregator can be downgraded
- **WHEN** no package depends on global editable owner state for editor-internal shortcut safety
- **THEN** `neko-tools` can remove the owner aggregator or keep it only as a compatibility guard for Workbench-level commands

## MODIFIED Requirements

### Requirement: Keyboard scope ownership and conflict resolution
The system SHALL resolve duplicate shortcut keys by keyboard boundary ownership, scope priority, explicit same-level priority, and the Webview root that owns DOM keyboard focus.

#### Scenario: Node and editor both bind Delete
- **WHEN** the event target is inside a node keyboard boundary and both node and editor scopes bind Delete
- **THEN** the node scope is evaluated before the editor fallback

#### Scenario: Text input inside selected node owns Delete
- **WHEN** a Canvas node is selected and a text input inside that node has DOM focus
- **THEN** the text-input scope owns Delete and the node/editor scopes do not delete the selected node

#### Scenario: Editable guard rejects a shortcut
- **WHEN** the event target is editable or composing and an outer editor scope also binds the same key
- **THEN** dispatch stops and does not fall through to the outer editor scope

#### Scenario: Duplicate shortcut is registered in one scope
- **WHEN** a single owner and scope registers the same structured key spec more than once
- **THEN** development-mode validation fails with a duplicate shortcut diagnostic

#### Scenario: Webview root is not keyboard focused
- **WHEN** a retained but unfocused Webview receives a local DOM key event or stale keyboard action message
- **THEN** it does not run editor-level actions or mutate editor state

### Requirement: Focused Webview routing
The system SHALL route Extension-originated explicit user commands to one focused Webview panel, while editor-internal keyboard shortcuts SHALL be handled by the focused Webview root dispatcher.

#### Scenario: Active visible panel exists
- **WHEN** two Webviews of the same view type are visible and one panel is active
- **THEN** Extension Host sends explicit user commands only to the active visible panel unless the command includes a more precise document URI

#### Scenario: Webview reports real keyboard focus
- **WHEN** two retained Webviews of the same view type are visible and one Webview reports `webviewKeyboardFocus` with `focused: true`
- **THEN** Extension Host treats that Webview as the unique focused panel and sends the previous focused Webview `keyboardFocus` with `focused: false`

#### Scenario: Webview reports editable keyboard focus during transition
- **WHEN** the focused Webview reports `webviewKeyboardEditable` with `editable: true`
- **THEN** Extension Host does not forward editor-level keyboard actions such as Delete, Select All, Undo, Redo, Copy, Cut, or Paste to that Webview while transition VSCode keybindings still exist

#### Scenario: WebviewView editable focus blocks active custom-editor keybindings during transition
- **WHEN** an Agent `WebviewView` input reports `webviewKeyboardFocus` and `webviewKeyboardEditable` with `editable: true`
- **AND** VSCode still reports `activeCustomEditorId == 'neko.canvasEditor'`
- **AND** Canvas or Model still contributes editor-internal VSCode keybindings
- **THEN** those contributed keybindings SHALL be disabled through the `neko.webview.keyboardEditable` when-context maintained by the global Webview keyboard owner registry

#### Scenario: Runtime command guard checks global editable ownership during transition
- **WHEN** an editor-level keyboard command reaches Canvas or Model despite keybinding when-context filtering
- **AND** Canvas or Model still depends on transition VSCode keybinding forwarding
- **AND** `neko.webviewKeyboard.hasEditableOwner` returns true
- **THEN** Extension Host SHALL NOT forward that keyboard action into the Canvas or Model Webview

#### Scenario: Multiple Webview editable owners overlap
- **WHEN** two Webviews report `webviewKeyboardEditable` with different owner ids
- **AND** one owner later reports `editable: false`
- **THEN** the global `neko.webview.keyboardEditable` when-context SHALL remain true until every owner has released editable ownership

#### Scenario: Command specifies document URI
- **WHEN** a command includes a target document URI
- **THEN** Extension Host routes the action to the panel registered for that document URI rather than the most recently created panel

#### Scenario: No focused target exists
- **WHEN** no focused panel can be resolved and visible fallback is not allowed
- **THEN** Extension Host does not post the explicit user command and reports command delivery failure to the command entrypoint
