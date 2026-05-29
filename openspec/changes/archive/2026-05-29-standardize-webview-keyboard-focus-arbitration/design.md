## Context

Neko Suite webviews currently own keyboard behavior at several unrelated layers:
package-level hooks register `window` or `document` key listeners, shared UI controls handle
some keys locally, and Extension Host commands forward VSCode keybindings into Webviews through
ad-hoc `keyboardAction` messages. This creates two failure modes: a text input can receive the
same key as a Canvas/node/timeline shortcut, and multiple visible panels can respond to one
Extension-originated command.

The architecture constraints are:

- Webviews cannot import `vscode` or call VSCode APIs directly.
- Extension Host code cannot import React or package Webview internals.
- `@neko/ui` is the canonical React/DOM UI surface; it can own DOM focus helpers and shared
  dispatcher behavior but must not own business actions.
- L0 shared types may contain serializable DTOs only if both host and Webview need the contract.
- Existing editor state remains package-owned through Zustand stores and controllers.

## Goals / Non-Goals

**Goals:**

- Provide one keyboard focus arbitration contract for editable targets, IME composition, modal/menu
  ownership, scope priority, duplicate shortcut detection, and command dispatch.
- Route user commands from Extension Host to exactly one focused Webview panel.
- Make shortcut definitions typed and cross-platform by using structured key specs rather than
  ambiguous strings.
- Migrate Canvas, Audio, Model, Sketch, and Cut off the highest-risk shortcut paths first.
- Preserve package-owned domain logic while making shortcut matching and focus behavior testable.

**Non-Goals:**

- Redesign the complete keyboard map for every editor.
- Move domain editing operations into `@neko/ui`.
- Require every shortcut to become a VSCode `package.json` keybinding.
- Change Rust engine, Protobuf contracts, media streaming, or persisted creative file formats.

## Decisions

### Decision 1: Use structured key specs inside Webviews

Webview shortcut tables will use `ShortcutKeySpec` with a stable `KeyboardKey` plus modifier flags.
The `primary` flag represents Cmd on macOS and Ctrl on Windows/Linux. VSCode keybinding strings
are adapter input/output, not the internal shortcut contract.

Alternatives considered:

- Keep `key: string`: rejected because it leaves `Space`, `space`, `ctrl+a`, and `CmdOrCtrl+A`
  semantics undefined.
- Store VSCode keybinding strings directly: rejected because VSCode's string format is host-facing
  and awkward for DOM event matching and package-local testing.

### Decision 2: Keep `@neko/ui` behavior-only and package actions package-owned

`@neko/ui` will provide helpers such as `isEditableTarget`, `isComposingKeyboardEvent`,
`KeyboardBoundary`, and `useKeyboardDispatcher`. Package adapters will pass typed shortcut
bindings and action callbacks into the dispatcher.

Alternatives considered:

- Add a central command registry with Canvas/Cut/Audio action names in `@neko/ui`: rejected because
  it would invert dependencies and couple shared UI to feature packages.
- Keep each package's hook independent: rejected because the current inconsistency is the problem.

### Decision 3: Resolve conflicts by boundary nesting, then priority

The dispatcher will evaluate the active keyboard boundaries from the event target outward. The
innermost matching boundary wins; explicit priority resolves same-level conflicts. Editable or IME
rejection stops dispatch rather than falling through to an outer editor shortcut.

Alternatives considered:

- Global priority only: rejected because it makes local component ownership harder to reason about.
- First registered shortcut wins: rejected because registration order is fragile in React trees.

### Decision 4: Add an Extension Host focused Webview registry

Custom editor providers and Webview view providers will register panel entries with a shared
focused registry. Commands will resolve by document URI first, then active visible panel, then
recent focused visible panel, then single-panel fallback when allowed. User commands must not use
broadcast helpers.

Alternatives considered:

- Continue per-provider `activeWebviewPanel` fields: rejected because last-created panel is not
  equivalent to focused panel in side-by-side editor groups.
- Ask Webviews to self-filter all commands: rejected because wrong-panel postMessage still creates
  stale state, confusing UI feedback, and hard-to-debug command delivery.

### Decision 5: Add lightweight focused panel feedback

Focused panels receive `keyboardFocus` messages and set `data-neko-keyboard-focused="true"` on
their shell root. Webviews also report real keyboard ownership back to the Extension Host with
`webviewKeyboardFocus` on `focusin`, `pointerdown`, window focus/blur, page hide, and visibility
changes. This gives side-by-side editors a consistent source for shortcut hints and lightweight
focus styling while treating VSCode tab/editor group state as a useful signal, not the sole source
of truth.

For editors that still use VSCode contributed keybindings, Webviews additionally report
`webviewKeyboardEditable` whenever focus enters or leaves an editable target. Extension Host uses
that signal as a second guard before forwarding editor-level commands, because VSCode's
`activeCustomEditorId` only identifies the custom editor type and does not by itself prove that
Delete/Cmd+A/Cmd+Z should target the canvas/model rather than an input inside the webview.

The same editable signal is required for `WebviewView` surfaces such as Agent. When Agent's input
owns keyboard focus, VSCode can still keep a Canvas custom editor as the active editor, so Canvas
and Model contributed keybindings must check the shared `neko.webview.keyboardEditable` context
before firing. Webviews update that context through a stable owner id via
`neko.webviewKeyboard.updateEditableOwner`; the owning service aggregates active owners so one
panel releasing focus cannot clear another panel's editable ownership. Canvas and Model also query
`neko.webviewKeyboard.hasEditableOwner` before forwarding editor-level keyboard actions, because the
VSCode `when` clause is only a pre-filter and can be bypassed by command entrypoints or context
update timing.

Alternatives considered:

- No visual feedback: rejected because side-by-side visible Webviews make command ownership
  ambiguous.
- Heavy custom focus chrome: rejected because it would compete with VSCode native focus styling.

## Risks / Trade-offs

- Existing listeners may remain during migration -> P0 work must wrap high-risk listeners with the
  shared guard before broader refactors.
- VSCode context keys are asynchronous -> Webview guard remains authoritative even when host-level
  `when` clauses are added.
- Shortcut tables need package state typing -> `ShortcutBinding<S>` uses package-provided generic
  state and defaults to `Record<string, unknown>` for simple cases.
- Registry fallback could still target a visible but not intended panel -> fallback is allowed only
  when explicitly requested and should prefer single-panel cases.
- Focus styling can drift between packages -> shared workbench shell/root data attributes should
  provide the canonical signal.

## Migration Plan

1. Add shared keyboard helpers, key spec utilities, dispatcher, boundary component, and tests in
   `@neko/ui` or a L0/L2 split if host DTOs are needed.
2. Add a focused Webview registry for Extension Host providers and wire Canvas/Model/Sketch custom
   editors first.
3. Replace Audio user command broadcasting with focused-panel routing while preserving broadcast for
   state/config notifications only.
4. Migrate Canvas `keyboardAction` handling and high-risk DOM listeners for Delete, Space, H,
   Cmd/Ctrl+A, undo/redo, copy/paste, and modal Escape.
5. Lift Sketch editable/IME behavior into shared helpers and update Sketch to consume them.
6. Migrate Cut package-level shortcut hook and selected global listeners to the dispatcher.
7. Add optional VSCode context key reporting after Webview-side guards are in place.
8. Run focused package tests first, then broaden to `pnpm check` or affected build/test commands.
