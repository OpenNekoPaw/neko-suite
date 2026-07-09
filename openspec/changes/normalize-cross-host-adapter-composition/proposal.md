## Why

Neko now has TUI, VSCode Webview, and Desktop/Electron surfaces, but host adaptation is split across several shapes: TUI uses Node ports, VSCode owns the complete Webview/Extension message path, and Desktop mixes Workbench feature descriptors with an Electron bridge plus VSCode-compatible shims. This creates duplicated UI risk, incomplete Agent behavior on Desktop, and pressure for every feature package to implement its own VSCode/Node/Electron variants.

This change normalizes host adapter composition so VSCode, Node/TUI, and Electron/Desktop are explicit host roots, while feature packages remain the authority for domain UI/runtime and only declare required host capabilities.

## What Changes

- Define canonical `vscode`, `node`, and `electron` host adapter composition boundaries on top of the existing `@neko/host` primitive ports and Workbench contribution contracts.
- Introduce a host-neutral Agent/Webview host runtime contract for message transport, state, config snapshots, conversations, tasks, skills, project search, file operations, plugin/capability routing, and diagnostics.
- Require Webview packages to consume injected host adapter facades or package-owned host-neutral ports instead of directly assuming VSCode transport.
- Keep package-owned feature Webview descriptors as the source of editor/surface metadata; host roots register and render them rather than redefining package UI.
- Make TUI the canonical `node` adapter for headless Agent/runtime capabilities, not a Webview adapter and not a duplicate UI implementation.
- Make Desktop the canonical `electron` adapter for window, IPC, file/resource access, viewport sessions, and scoped Webview/runtime messaging.
- Make VSCode the canonical `vscode` adapter for Extension Host APIs, Webview CSP/resource projection, custom editors, storage, commands, and workbench integration.
- Add guardrails and tests that prevent feature packages from introducing package-local VSCode/Node/Electron adapter stacks when shared host ports or injected adapters should be used.
- **BREAKING**: New Desktop Agent/Webview requests must fail visibly when no Electron host handler is registered instead of returning empty snapshots or relying on a global VSCode shim as a successful fallback.
- **BREAKING**: Production Webview code must not introduce new direct `window.vscodeApi` / `@neko/shared/vscode` calls for host-neutral runtime surfaces after the injected adapter path exists, except for explicitly scoped VSCode transport adapters.

## Capabilities

### New Capabilities

- `cross-host-adapter-composition`: Defines the canonical VSCode, Node/TUI, and Electron/Desktop adapter boundaries, host capability registration rules, and package ownership policy for multi-host Neko clients.
- `agent-host-runtime-adapter`: Defines the host-neutral Agent runtime/Webview adapter contract used by VSCode and Desktop, with TUI mapped to runtime services instead of Webview transport.

### Modified Capabilities

- `webview-vscode-bridge`: New host-neutral Webview runtime surfaces must use injected host transport/facades; the shared VSCode bridge remains the VSCode transport implementation, not the cross-host API.
- `webview-foundation-capabilities`: Shared Webview foundations must be initialized through host-provided theme/i18n/logger/error/keyboard context where applicable, so Desktop and VSCode do not drift.
- `project-file-io`: Project file and resource operations must route through host adapter ports for VSCode/Electron/Node instead of package-local filesystem or Webview assumptions.
- `cross-domain-content-access-runtime`: Resource projection, thumbnails, cache, and content access must use host ports plus shared content services across VSCode, Electron, and Node.
- `agent-config-snapshot-lifecycle`: Config snapshot reads and settings updates must be available through the shared Agent host runtime adapter for VSCode and Electron, with TUI continuing to consume the same platform config runtime directly.

## Impact

- Affected packages:
  - `packages/neko-host`: existing primitive host port contracts remain the foundation; may receive small additions only when a real host boundary requires them.
  - `packages/neko-workbench-core`: host capability descriptors, contribution validation, and adapter registry rules may be extended for adapter composition diagnostics.
  - `packages/neko-agent/packages/webview`: replaces direct VSCode transport assumptions in Agent UI with injected host runtime/facade boundaries.
  - `packages/neko-agent/packages/extension`: becomes the VSCode Agent host adapter implementation and keeps VSCode API usage at the Extension composition root.
  - `packages/neko-agent/packages/cli-tui`: remains the Node adapter for headless Agent/runtime behavior and maps shared contracts to direct runtime calls.
  - `packages/neko-desktop`: becomes the Electron adapter implementation for IPC, scoped runtime channels, file/resource access, Agent host parity, and engine viewport sessions.
  - Feature Webview packages such as Cut, Canvas, Audio, Sketch, Model, Preview, Assets, Market, and future plugins: must expose package-owned UI/runtime descriptors and consume host-neutral facades rather than adding per-host UI forks.
- Affected runtime paths:
  - Agent Webview message routing, config/settings snapshot lifecycle, conversation/task/skill/file/search commands, plugin/capability invocation, and Desktop Electron IPC.
  - Desktop resource explorer, media thumbnails, viewport session dispatch, and Webview/runtime scoping.
  - VSCode Webview transport, custom editor/resource projection, and extension-host service registration.
  - TUI runtime bootstrap, Node content access, config loading, task storage, and headless Agent capability registration.
- Compatibility:
  - No durable `nk*` project file format change is intended.
  - Existing user/workspace `.neko` config data remains authoritative through platform/config and storage scopes.
  - Current Desktop global VSCode shim may exist only as a temporary migration bridge with diagnostics and removal criteria; it must not be the accepted canonical path for new host-neutral surfaces.
  - Prelaunch breakage is acceptable for internal Webview transport APIs and Desktop Agent bridge behavior when it removes duplicate UI/adapter paths and is covered by path-level tests.
