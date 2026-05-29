## Why

Neko Suite webviews currently handle shortcuts through package-local `window`/`document` listeners and ad-hoc Extension-to-Webview command forwarding. This causes IME/text input conflicts inside a panel and ambiguous command delivery when multiple editor panels are open side by side.

## What Changes

- Introduce a shared keyboard focus arbitration contract for Webview shortcuts, editable target detection, IME composition guards, scope ownership, and conflict resolution.
- Add a structured shortcut key specification and dispatcher behavior so packages stop passing ambiguous shortcut strings such as `Space`, `ctrl+a`, or `CmdOrCtrl+A`.
- Add focused Webview routing in Extension Host code so user commands are delivered to one resolved panel instead of being broadcast to active panels.
- Add lightweight focused-panel feedback for side-by-side Webview editors through a `keyboardFocus` message and root data attribute.
- Migrate the highest-risk packages first: Canvas, Audio, Model, Sketch, and Cut.
- Add tests for IME safety, editable input boundaries, duplicate shortcut detection, scope priority, and multi-panel routing.

## Capabilities

### New Capabilities

- `webview-keyboard-focus-arbitration`: Defines the cross-Webview keyboard focus, shortcut, IME, scope priority, conflict detection, and focused panel routing contract.

### Modified Capabilities

- `webview-ui-design-system`: Adds shared `@neko/ui` keyboard helpers, `KeyboardBoundary`, and `useKeyboardDispatcher` requirements to the canonical Webview UI surface.
- `audio-webview-control-protocol`: Requires Extension-originated audio user commands to route to the focused audio Webview instead of broadcasting to all active audio panels.

## Impact

- Affected shared packages: `packages/neko-ui`, and possibly L0 serializable keyboard DTOs in `packages/neko-types` if the implementation chooses to share host/webview action envelopes outside React.
- Affected Webview packages: `neko-canvas`, `neko-sketch`, `neko-cut`, `neko-audio`, `neko-model`, plus lower-risk follow-up adoption in Preview/Agent where local shortcut hooks exist.
- Affected Extension packages: custom editor providers and command registrations that currently keep a single `activeWebviewPanel` or use `postToActivePanels()` for user commands.
- No Rust engine, Protobuf, media pipeline, or file format changes are expected.
