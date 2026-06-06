## Context

`adr-webview-keyboard-focus-arbitration.md` defines the current transition layer and the target architecture. The transition layer keeps Canvas/Model VSCode `contributes.keybindings` for editing shortcuts, then blocks them with `!neko.webview.keyboardEditable` and a runtime `neko.webviewKeyboard.hasEditableOwner` query. That protects users now, but still makes Webview editing semantics depend on VSCode Workbench keybinding resolution and a cross-extension owner aggregator.

The target architecture is Webview-Owned Keyboard Dispatch: editing shortcuts are interpreted by the Webview that owns DOM focus, while Extension Host routes only explicit commands with a concrete target.

Canvas is the proving ground because it has the most nested keyboard ownership: viewport, container, node, inline input, prompt panel, toolbar popovers, and node text editing. Model follows the same pattern with viewport, inspector/property controls, modal/popover controls, and editor fallback.

## Goals / Non-Goals

**Goals:**

- Move Canvas editing shortcuts from VSCode global keybindings into one Webview root keyboard dispatcher.
- Model the Canvas owner tree so `Selection` and `Keyboard Owner` are separate concepts.
- Remove Canvas editing keybindings from `neko-canvas/package.json` only after Webview behavior is covered by tests.
- Apply the same Webview-owned pattern to Model and remove Model editing keybindings after coverage is in place.
- Keep Extension Host command routing for explicit commands and make those commands target by `documentUri` or focused Webview.
- Preserve the current global editable owner guard during migration and define it as removable transition infrastructure.

**Non-Goals:**

- Redesigning the full shortcut map or changing user-facing shortcut assignments.
- Rewriting all packages at once. Canvas and Model are the scoped migration targets for this change.
- Removing VSCode commands themselves. Commands remain useful for menus, command palette, Outline, StatusBar, and plugin integrations.
- Changing Rust engine, Protobuf contracts, media computation, or domain data models.

## Decisions

### Decision 1: Editing shortcuts are Webview-owned, not Workbench-owned

Canvas/Model will stop using VSCode `contributes.keybindings` for editor-internal actions such as Delete, Backspace, Escape, Cmd/Ctrl+A, Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, and Canvas Cmd/Ctrl+G. The Webview root dispatcher will handle these shortcuts only when that Webview has keyboard focus.

Model intentionally migrates only shortcuts that already have concrete Model-domain behavior: Escape clears the current selection and Digit0 resets the viewport. Removed Model manifest bindings such as Delete, Select All, Undo, and Redo are not re-created as no-op Webview bindings because the current 3D viewport has no implemented editor-level action for them. Text and property controls still own Delete, Backspace, Cmd/Ctrl+A, Space, Enter, and IME composition through their keyboard boundaries, so the migration removes the cross-Webview conflict surface without inventing unsupported Model editing semantics.

Rationale: VSCode `activeCustomEditorId` identifies the active editor type, not the Webview DOM focus owner. It cannot reliably distinguish Agent input focus, retained hidden Webviews, side-by-side Canvas tabs, or a node input inside a selected Canvas node.

Alternative considered: keep global keybindings and add more when-context. This remains useful as transition safety, but it preserves asynchronous context races and cross-package coupling.

### Decision 2: Canvas gets the first complete owner-tree implementation

Canvas will get a `CanvasKeyboardController` or equivalent root dispatcher that collects declarative shortcut bindings and resolves them through `KeyboardBoundary` metadata. It will replace scattered `window.addEventListener('keydown')` paths for editor-level shortcuts.

Canvas owner levels:

1. `text-input`
2. `modal` / `popover` / `menu`
3. `inline-editor`
4. `node` / `container`
5. `viewport`
6. `editor`

Rationale: Canvas contains the hardest cases. If the shared `@neko/ui/keyboard` contract is insufficient, Canvas will reveal that before Model and other packages adopt the pattern.

Alternative considered: start with Model because it is smaller. That would reduce initial risk, but it would not validate the nested input/node/container conflicts that caused the user-facing failures.

### Decision 3: Selection never implies keyboard ownership

Canvas selected nodes, selected containers, selected connections, and active viewport state are domain selection state only. The dispatcher decides keyboard ownership from event target, focused root state, and nearest keyboard boundary. If a selected node contains a focused input, the input owns Delete, Cmd/Ctrl+A, Space, Enter, and IME composition.

Rationale: The user can select a node and then edit a prompt field inside that node. Treating selection as keyboard ownership causes the exact delete/select-all conflict this change is meant to remove.

Alternative considered: clear node selection when entering inputs. That would reduce shortcut conflicts, but it changes editing workflow and loses useful visual context.

### Decision 4: Extension Host routes explicit commands only

VSCode commands remain registered, but editing shortcut dispatch should no longer be the primary path into the Webview. Explicit commands from Outline, StatusBar, command palette, menus, and plugin integrations must include a `documentUri` when possible, otherwise use focused Webview resolution.

Rationale: Extension Host has reliable knowledge for workbench-level actions and explicit command sources; it does not have reliable knowledge of internal DOM keyboard ownership.

Alternative considered: route all actions through Extension Host for uniform logging. This centralizes telemetry but weakens focus correctness and keeps Webview editing dependent on asynchronous message state.

### Decision 5: Global editable owner remains a transition guard

`neko.webview.keyboardEditable` and `neko.webviewKeyboard.hasEditableOwner` remain during migration to protect current global keybindings and explicit commands. After Canvas/Model remove editing keybindings, the service can be downgraded to a compatibility guard or removed if no package depends on it for Workbench-level keybinding safety.

Rationale: Removing the transition guard before Webview dispatch is complete would regress the current conflict fix. Keeping it forever would leave hidden coupling through `neko-tools`.

Alternative considered: remove the global owner first. This is unsafe because current package manifests still contribute editing keybindings.

## Risks / Trade-offs

- [Risk] Canvas has many existing keyboard listeners, so partial migration could leave duplicate handlers. → Mitigation: inventory and collapse editor-level listeners into the root dispatcher before removing VSCode keybindings.
- [Risk] Webview-owned dispatch can miss shortcuts when the Webview root is not focusable. → Mitigation: make the root focus contract explicit and test click/focus entry into viewport, node, and input areas.
- [Risk] Removing `contributes.keybindings` can break command palette expectations if command definitions are accidentally removed. → Mitigation: remove only `contributes.keybindings`, keep `contributes.commands` and Extension command handlers.
- [Risk] IME behavior differs across platforms. → Mitigation: preserve `isComposing` and `keyCode === 229` tests and add Webview dispatcher tests around composition.
- [Risk] The transition global owner may become permanent coupling. → Mitigation: add tasks and tests that verify Canvas/Model package manifests no longer expose editing keybindings.

## Migration Plan

1. Harden `@neko/ui/keyboard` APIs for Canvas owner-tree use, including `inline-editor` scope if needed.
2. Build Canvas root dispatcher and move editor-level shortcuts from scattered listeners into declarative bindings.
3. Add Canvas KeyboardBoundary annotations for node/container, inline inputs, modal/popover/menu surfaces, and viewport.
4. Verify Canvas nested input, IME, side-by-side, and explicit command routing behavior.
5. Remove Canvas editing `contributes.keybindings`; keep commands and explicit command routing.
6. Repeat the pattern for Model.
7. Reassess `neko-tools` global editable owner and remove or downgrade it once package manifests no longer need it for editing shortcuts.

Rollback strategy: keep the transition guard and Extension Host command handlers until the package manifest keybindings are removed. If Webview dispatch regresses, restore the manifest keybindings for the affected package while keeping the new tests as failing evidence.

## Open Questions

- Should Canvas root dispatcher live directly in `CanvasApp` or as a separate `CanvasKeyboardController` hook/module?
- Should `inline-editor` become a formal shared `KeyboardScope`, or should it map to `text-input` with an owner subtype?
- Which explicit commands should remain keyboard-addressable through VSCode for accessibility after editing keybindings move into the Webview?
