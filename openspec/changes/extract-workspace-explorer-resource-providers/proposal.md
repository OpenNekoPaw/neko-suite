## Why

Desktop currently scans workspace files and `.neko` resource surfaces inside `packages/neko-desktop`, which keeps the standalone client as an accidental owner of resource semantics. Neko needs provider-backed resource surfaces so Desktop, VSCode, TUI, and future plugin/package contributions can consume the same stable resource model without duplicating file trees, thumbnails, cache rules, or domain parsing.

## What Changes

- Add a host-neutral resource provider contract to `@neko/workbench-core` for workspace explorer/resource surfaces.
- Move shared file kind classification, media kind detection, portable resource refs, and provider snapshot validation out of desktop-only code.
- Wrap the current desktop workspace scanner behind a provider-compatible adapter and mark it as temporary bootstrap until domain-owned providers replace it.
- Keep `.neko/.cache`, Webview URIs, blob URLs, Engine tokens, and absolute paths out of durable resource identity.
- Preserve desktop's existing runtime behavior while creating the canonical provider boundary needed by `align-desktop-to-workbench-core`.
- **BREAKING**: Provider snapshots with non-portable stable refs or unsafe runtime identity MUST fail visibly instead of returning a successful empty tree.

## Capabilities

### New Capabilities

- `workspace-resource-provider-runtime`: Defines host-neutral workspace/resource provider snapshots, workspace tree node kinds, classification helpers, provider diagnostics, and portable identity validation.
- `desktop-workspace-resource-provider-adapter`: Defines how Desktop wraps its current workspace scanner behind the shared provider contract while marking the path as a temporary bootstrap provider.

### Modified Capabilities

- None.

## Impact

- Affected packages:
  - `packages/neko-workbench-core`: new resource provider types, helpers, validation, and tests.
  - `packages/neko-desktop`: workspace scan classification imports shared helpers and exposes a provider-compatible desktop adapter.
- Affected follow-up work:
  - `align-desktop-to-workbench-core` can add Workbench Core provider snapshots to the desktop renderer boundary.
  - Assets, Market, Skills, Search, Generations, and Entity providers can later register through the same contract.
- Validation:
  - Workbench Core tests for classification, portable identity, unsafe ref rejection, and provider diagnostics.
  - Desktop tests proving the workspace scanner is wrapped as a temporary provider and still returns the existing tree shape.
