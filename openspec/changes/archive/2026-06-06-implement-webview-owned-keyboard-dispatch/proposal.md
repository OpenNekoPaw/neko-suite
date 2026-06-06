## Why

The current keyboard focus fix is a necessary transition layer, but Canvas and Model still route editor-level shortcuts through VSCode global keybindings before forwarding them back into Webviews. That keeps cross-plugin, side-by-side tab, and single-tab nested input conflicts alive as long-term architecture risks.

This change moves editor-owned shortcuts to the Webview that actually owns DOM focus, while keeping Extension Host routing only for explicit commands such as menus, Outline, StatusBar, command palette, and plugin calls.

## What Changes

- Move Canvas editing shortcuts to a single Canvas root keyboard dispatcher with scoped ownership for text inputs, modal/menu/popover, inline editors, node/container selection, viewport, and editor fallback.
- Remove Canvas editing shortcuts from `neko-canvas` VSCode `contributes.keybindings` after the Webview dispatcher and regression tests are in place.
- Introduce the same Webview-owned dispatch pattern for Model, covering viewport, inspector/property inputs, modal/popover controls, and editor fallback.
- Remove Model editing shortcuts from `neko-model` VSCode `contributes.keybindings` after Model owns its keyboard dispatch.
- Keep VSCode commands for explicit command entrypoints, but require those entrypoints to route by `documentUri` or focused Webview instead of guessing from a global active panel.
- Keep the current global editable owner context as a transition safety layer during migration, then make it removable or downgrade it to a compatibility guard once Canvas/Model no longer contribute editing keybindings.
- Add regression coverage for nested Canvas input ownership, IME composition, side-by-side Webview focus changes, WebviewView owner lifecycle races, and removal of editing keybindings from package manifests.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `webview-keyboard-focus-arbitration`: strengthen the keyboard ownership requirements so editor-level shortcuts are owned by the focused Webview root dispatcher instead of VSCode global keybindings, and define the exit criteria for the transition global editable owner guard.

## Impact

- `packages/neko-canvas/package.json`
- `packages/neko-canvas/packages/webview/src/**`
- `packages/neko-canvas/packages/extension/src/**`
- `packages/neko-model/package.json`
- `packages/neko-model/packages/webview/src/**`
- `packages/neko-model/packages/extension/src/**`
- `packages/neko-ui/src/keyboard/**`
- `packages/neko-tools/packages/extension/src/services/WebviewKeyboardContextService.ts` may be retained as transition infrastructure and later downgraded or removed.
- Existing ADR: `docs/architecture/adr-webview-keyboard-focus-arbitration.md`
