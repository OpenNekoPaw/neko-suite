## Why

Desktop already marks `neko-engine` as the viewport owner, but the contract is still a loose summary plus contribution fields. Neko needs an explicit Engine viewport session contract so professional media/model output truth, color pipeline, texture leasing, and Webview control surfaces cannot drift into host-local assumptions.

## What Changes

- Introduce a host-neutral Engine viewport session contract in Workbench Core.
- Model the Engine-owned output surface separately from Webview/control surfaces.
- Validate that authoritative viewport sessions are owned by `neko-engine` and that Webview/canvas/WebCodecs/Electron projections remain non-authoritative.
- Update Desktop viewport summary and Workbench viewport contribution generation to consume the contract.
- Keep current Desktop health probe and intent routing behavior; this slice does not implement native texture/surface routing.
- **BREAKING**: Invalid viewport session contracts fail visibly instead of being accepted as generic capability strings.

## Capabilities

### New Capabilities

- `engine-viewport-session-contract`: Defines Engine-owned viewport session identity, authority, output surface, color/texture capabilities, control surfaces, non-authoritative projections, and validation behavior.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-workbench-core`: adds Engine viewport session DTOs, validation, and contribution projection helpers.
  - `packages/neko-desktop`: uses the session contract in `EngineViewportSummary` and Workbench contribution creation.
- Affected APIs:
  - New `WorkbenchEngineViewportSessionContract` and helper functions.
  - Extended Desktop viewport snapshot with structured session contract.
- Validation:
  - Workbench Core contract tests for authority, non-authoritative Web projections, and contribution projection.
  - Desktop tests proving viewport summaries and contributions use the session contract.
