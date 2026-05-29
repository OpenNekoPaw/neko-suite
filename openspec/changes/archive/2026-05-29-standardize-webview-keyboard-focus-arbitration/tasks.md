## 1. Shared Keyboard Contract

- [x] 1.1 Add structured keyboard key/spec types and parser/formatter tests for VSCode keybinding strings.
- [x] 1.2 Add editable target and IME guard helpers covering input, textarea, select, contenteditable, role textbox, and `data-neko-keyboard-scope`.
- [x] 1.3 Add `KeyboardBoundary` ownership primitives with scope, owner id, priority, and target containment metadata.
- [x] 1.4 Add `useKeyboardDispatcher` with duplicate shortcut validation, scope priority resolution, and editable/IME stop behavior.
- [x] 1.5 Add `@neko/ui` boundary tests proving keyboard helpers do not import VSCode, Node-only APIs, or feature packages.

## 2. Focused Webview Routing

- [x] 2.1 Implement `IFocusedWebviewRegistry` in Extension-safe code with register, unregister, markActive, markVisible, resolve, and postKeyboardAction APIs.
- [x] 2.2 Add unit tests for document URI routing, active visible routing, recent visible fallback, no-target failure, and unregister cleanup.
- [x] 2.3 Wire focused registry into Canvas, Model, and Sketch custom editor providers without changing their document lifecycle behavior.
- [x] 2.4 Send `keyboardFocus` messages on focus changes and expose `data-neko-keyboard-focused` on the Webview shell/root.
- [x] 2.5 Keep broadcast helpers available only for non-user state/config/progress notifications.

## 3. Package Migrations

- [x] 3.1 Migrate Canvas `keyboardAction` message handling through shared focus guards and ignore stale actions when not keyboard-focused.
- [x] 3.2 Migrate Canvas high-risk DOM shortcuts for Delete, Backspace, Space, H, Cmd/Ctrl+A, undo, redo, copy, cut, paste, duplicate, and modal Escape.
- [x] 3.3 Replace Audio Extension-originated user command broadcasting with focused-panel routing while preserving state notification broadcasts.
- [x] 3.4 Lift Sketch editable/IME guard behavior to the shared helpers and update Sketch shortcuts to consume the shared helper.
- [x] 3.5 Migrate Cut package-level shortcut hook and selected global listeners to the shared dispatcher or shared guards.
- [x] 3.6 Add Model keyboard action stale-focus guard and focused registry routing for model editor commands.

## 4. UI Primitive Adoption

- [x] 4.1 Add KeyboardBoundary metadata to shared text, number, color, select, dialog, popover, context menu, tree, and keyframe/timeline controls touched by this change.
- [x] 4.2 Ensure modal/menu controls own Escape, Enter, and arrow keys before editor fallback shortcuts.
- [x] 4.3 Ensure shortcut hints and active shortcut affordances only render for keyboard-focused Webview roots.

## 5. Validation

- [x] 5.1 Add Webview tests proving Canvas node input Delete does not delete nodes, Space does not pan, and Cmd/Ctrl+A selects text only.
- [x] 5.2 Add IME composition tests proving Enter/Escape/Space do not trigger editor-level actions during composition.
- [x] 5.3 Add side-by-side custom editor routing tests proving only the focused panel receives user keyboard actions.
- [x] 5.4 Run focused package tests for `@neko/ui`, Canvas, Sketch, Model, Cut, and Audio.
- [x] 5.5 Run `pnpm check` or the smallest broader repository validation agreed for the implementation diff.
