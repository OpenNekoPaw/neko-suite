## 1. Result Reference Contract

- [x] 1.1 Add a red-capable Agent task-result regression test proving an unpromoted generated output is projected only as `resource`, never `asset`.
- [x] 1.2 Add a contract test proving actual AssetLibrary identities remain available only through typed `asset` refs, `assetId`, or `assetIds`.
- [x] 1.3 Add a Platform media observation test proving the generated lifecycle/resource identity reaches task output without implying AssetLibrary membership.

## 2. Canonical Agent Path

- [x] 2.1 Remove implicit AssetLibrary inference from generic task-result presentation entries while preserving validated generated `ResourceRef` projection.
- [x] 2.2 Update Extension terminal media delivery assertions so follow-up context contains `ReadImage` resource input and excludes a generated-output `asset` reference.
- [x] 2.3 Verify no generated-index fallback is added to `GetAsset` and add coverage for pre-promotion failure plus explicit AssetLibrary import/promotion success.
- [x] 2.4 Require the binding-owned SQLite ResourceCache manifest store in TUI default content capability assembly and prove generated `ReadImage` through the ToolRegistry.
- [x] 2.5 Add a red-capable Extension regression test proving `ReadImage` and perception resolve the same pathless generated lifecycle `ResourceRef` through generated-output lookup.
- [x] 2.6 Create the Extension generated-output index before content access and inject one host-neutral Platform resolver shared with TUI; do not add direct-path or AssetLibrary fallback.

## 3. Evaluation And Documentation

- [x] 3.1 Update the owning Agent Evaluation suite with generated resource routing, forbidden pre-promotion `GetAsset`, terminal task state, and durable output evidence.
- [x] 3.2 Record the Evaluation authoring decision, canonical path, forbidden fallback, real-run report or exact blocker, and residual risk in this change.
- [x] 3.3 Update relevant Agent/media architecture documentation if the result-reference ownership rule is not already explicit.

## 4. Verification And Review

- [x] 4.1 Run focused Agent, Platform, Extension, and Assets tests that cover normalization, delivery, content access, and strict asset lookup.
- [x] 4.2 Run affected package typecheck/build and the key-free Agent Evaluation harness/suite validation.
- [x] 4.3 Run the focused real TUI Evaluation case when provider/model credentials are available; otherwise record the exact blocking condition.
- [x] 4.4 Run `git diff --check`, inspect legacy/debt terms and dependency boundaries, and complete an L3 `neko-quality-review` with remaining risks.
- [x] 4.5 Run focused Platform/TUI/Extension content-access tests, `pnpm build:neko-agent`, `pnpm test:agent:eval`, and Extension Development Host acceptance with `vscode-extension-debugger`.
