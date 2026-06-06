## 1. Shared Keyboard Contract

- [x] 1.1 Audit `@neko/ui/src/keyboard` against Canvas owner-tree needs and add any missing `KeyboardScope` values such as `inline-editor`, `container`, or `popover`.
- [x] 1.2 Ensure `useKeyboardDispatcher` can be used as a single root dispatcher with stable binding registration and without per-render listener churn.
- [x] 1.3 Add or update dispatcher tests for innermost boundary wins, same-level priority, editable rejection without outer fallback, and unfocused root ignoring editor-level actions.
- [x] 1.4 Add shared examples or test fixtures for text input, modal/menu/popover, inline editor, node/container, viewport, and editor fallback ownership.

## 2. Canvas Webview-Owned Dispatcher

- [x] 2.1 Inventory Canvas Webview keyboard entrypoints, including `CanvasApp`, `useKeyboardActions`, `useViewportTransform`, `useConnectionDrag`, `ContentOverlay`, toolbar escape handling, inline controls, `EditableText`, `ContainerRenderer`, `GenerationPromptPanel`, and `TextNode`.
- [x] 2.2 Introduce `CanvasKeyboardController` or an equivalent root hook that owns Canvas editor-level shortcuts through declarative bindings.
- [x] 2.3 Move Delete, Backspace, Escape, Cmd/Ctrl+A, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Cmd/Ctrl+G, Space, and viewport tool shortcuts into the Canvas root dispatcher where applicable.
- [x] 2.4 Add KeyboardBoundary metadata to Canvas viewport, container, node, inline-editor, text-input, modal/popover/menu, toolbar, and property/prompt surfaces.
- [x] 2.5 Remove duplicate Canvas editor-level `window`/`document` keydown listeners or reduce them to local control-only handlers that cannot trigger editor-level mutations.
- [x] 2.6 Keep Canvas Extension Host explicit command routing for Outline, StatusBar, command palette, and plugin calls, using `documentUri` or focused Webview resolution.

## 3. Canvas Regression Coverage

- [x] 3.1 Add Canvas Webview tests proving node/container selection does not own Delete, Backspace, Cmd/Ctrl+A, Space, Enter, or Cmd/Ctrl+Z while a nested input has DOM focus.
- [x] 3.2 Add Canvas Webview tests proving IME composition blocks editor-level shortcuts and does not fall through to node, viewport, or editor scopes.
- [x] 3.3 Add Canvas Webview tests for modal/menu/popover ownership of Escape, Enter, Arrow keys, and Tab where applicable.
- [x] 3.4 Add Canvas side-by-side or provider tests proving stale/unfocused Webviews ignore local and host-originated editor-level keyboard actions.
- [x] 3.5 Add Canvas contract tests proving explicit commands still route by `documentUri` after editing keybindings are removed.

## 4. Canvas Manifest Migration

- [x] 4.1 Remove Canvas editor-internal editing shortcuts from `packages/neko-canvas/package.json` `contributes.keybindings`.
- [x] 4.2 Keep Canvas `contributes.commands` and Extension command handlers for explicit command entrypoints.
- [x] 4.3 Update Canvas keyboard focus routing contract tests to assert editing keybindings are absent and explicit command declarations remain.
- [x] 4.4 Compile Canvas extension and Webview bundles and update `packages/neko-canvas/dist`.

## 5. Model Webview-Owned Dispatcher

- [x] 5.1 Inventory Model keyboard entrypoints, including `App.tsx`, viewport controls, inspector/property controls, toolbar, modal/popover surfaces, and Extension Host `keyboardAction` forwarding.
- [x] 5.2 Introduce a Model root dispatcher for editor-level viewport and editor fallback shortcuts.
- [x] 5.3 Add KeyboardBoundary metadata to Model viewport, inspector/property inputs, toolbar, modal/popover/menu surfaces, and editor fallback root.
- [x] 5.4 Ensure Model text/property inputs own Delete, Backspace, Cmd/Ctrl+A, Space, Enter, Undo/Redo text behavior, and IME composition.
- [x] 5.5 Preserve Model explicit command routing through `documentUri` or focused Webview resolution.

## 6. Model Regression Coverage

- [x] 6.1 Add Model Webview tests for viewport shortcuts only firing when viewport/editor scope owns keyboard focus.
- [x] 6.2 Add Model Webview tests for inspector/property input ownership of Delete, Backspace, Cmd/Ctrl+A, Space, and IME composition.
- [x] 6.3 Add Model provider tests for side-by-side focused routing and stale/unfocused Webview action rejection.
- [x] 6.4 Add Model contract tests proving explicit commands remain available after editing keybindings are removed.

## 7. Model Manifest Migration

- [x] 7.1 Remove Model editor-internal editing shortcuts from `packages/neko-model/package.json` `contributes.keybindings`.
- [x] 7.2 Keep Model `contributes.commands` and Extension command handlers for explicit command entrypoints.
- [x] 7.3 Update Model keyboard focus routing contract tests to assert editing keybindings are absent and explicit command declarations remain.
- [x] 7.4 Compile Model extension and Webview bundles and update `packages/neko-model/dist`.

## 8. Transition Guard and Documentation

- [x] 8.1 Update `docs/architecture/adr-webview-keyboard-focus-arbitration.md` if implementation reveals changes to the owner tree, scope names, or transition guard exit criteria.
- [x] 8.2 Add tests for `neko-tools` global editable owner showing it remains correct during transition but is not required for Canvas/Model Webview-owned editing dispatch.
- [x] 8.3 Audit package manifests to confirm no Canvas/Model editor-internal editing shortcuts remain in VSCode `contributes.keybindings`.
- [x] 8.4 Decide whether to keep, downgrade, or remove `neko.webview.keyboardEditable` and `neko.webviewKeyboard.hasEditableOwner` after Canvas/Model migration.

## 9. Validation

- [x] 9.1 Run focused `@neko/ui` keyboard tests.
- [x] 9.2 Run Canvas Webview and Extension keyboard routing tests.
- [x] 9.3 Run Model Webview and Extension keyboard routing tests.
- [x] 9.4 Run `pnpm --filter neko-canvas run compile` and `pnpm --filter neko-model run compile`.
- [x] 9.5 Run `git diff --check`.
