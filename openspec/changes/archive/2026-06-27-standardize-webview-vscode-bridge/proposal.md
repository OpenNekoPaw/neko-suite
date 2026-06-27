## Why

Multiple Neko Webviews currently acquire and wrap the VS Code Webview API in package-local ways. This duplicates sandbox-sensitive code, makes `acquireVsCodeApi()` single-call behavior harder to reason about, and encourages new Webviews to create parallel bridge, state, and message-listener utilities instead of using the shared `@neko/shared/vscode` boundary.

This change standardizes Webview-to-Extension bridge access now because the repository already has a shared `@neko/shared/vscode` module, but adoption is uneven across Canvas, Dashboard, Live, Market, Preview, Sketch, Story, Tools, and other Webviews.

## What Changes

- Introduce a canonical Webview bridge capability based on `@neko/shared/vscode` for:
  - safe singleton access to the VS Code Webview API,
  - no-op or mock-safe behavior outside VS Code where appropriate,
  - typed `postMessage`, `getState`, `setState`, and request-response helper usage.
- Migrate package-local bridge entry points to compose the shared bridge instead of directly calling `acquireVsCodeApi()`.
- Keep each Webview package's typed domain message facade local to the owning package.
- Add tests or static guardrails that prevent new production Webview code from directly acquiring the VS Code API outside the shared bridge or a documented package-local facade.
- Document the expected bridge layering for future Webview work.
- Remove obsolete duplicate singleton wrappers when their behavior is replaced by the shared bridge.

### Non-Goals

- Redesign every Webview message protocol in one change.
- Move domain-specific message unions, command builders, or handler registries into `@neko/shared`.
- Change Extension Host command names, Webview message payload semantics, or durable project file formats.
- Replace existing `postMessage` business flows with a new RPC framework.
- Validate every Webview's visual UI behavior beyond bridge/runtime smoke paths affected by this change.

### Compatibility

This is intended as an internal prelaunch cleanup with no user-facing file-format migration. Existing Webview message payloads should continue to work while their acquisition and transport plumbing move to the canonical bridge. Any removed package-local compatibility wrapper must have all callers migrated in the same change or be left as a thin deprecated re-export with a recorded removal condition.

## Capabilities

### New Capabilities

- `webview-vscode-bridge`: Defines the canonical Webview-side VS Code API acquisition, messaging, state, request-response, and boundary rules used by feature Webviews.

### Modified Capabilities

- None.

## Impact

- Shared packages:
  - `packages/neko-types/src/vscode/*`
  - potentially `packages/neko-types/src/i18n` only if test utilities need shared setup text, not as part of the core bridge contract
- Webview packages with direct or package-local bridge wrappers:
  - `packages/neko-agent/packages/webview`
  - `packages/neko-audio/packages/webview`
  - `packages/neko-canvas/packages/webview`
  - `packages/neko-cut/packages/webview`
  - `packages/neko-dashboard/packages/webview`
  - `packages/neko-live/packages/webview`
  - `packages/neko-market/packages/webview`
  - `packages/neko-model/packages/webview`
  - `packages/neko-preview/packages/webview`
  - `packages/neko-puppet/packages/webview`
  - `packages/neko-sketch/packages/webview`
  - `packages/neko-story/packages/webview`
  - `packages/neko-tools/packages/webview`
- Tests and guardrails:
  - shared bridge unit tests,
  - package Webview message tests where bridge behavior is touched,
  - dependency/boundary checks proving Webviews do not import `vscode` or bypass the canonical acquisition path.
- Runtime validation:
  - focused VS Code Webview runtime smoke for migrated bridge paths, especially ready messages, document state restore/save, keyboard focus messages, and request-response flows.
