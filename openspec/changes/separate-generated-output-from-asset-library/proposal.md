## Why

Generated media completion currently projects one generated output as both an Agent `asset` reference and a `resource` reference. The `asset` label incorrectly implies AssetLibrary membership, so follow-up turns can call `GetAsset` with a generated-output id even though no AssetLibrary entity exists.

## What Changes

- **BREAKING**: Stop projecting generated task outputs as AssetLibrary `asset` refs solely because their transport payload uses an `assets` collection.
- Preserve generated outputs as stable generated-output/resource identities for preview, `ReadImage`, perception, reload, and asynchronous task continuation.
- Keep AssetLibrary lookup strict: `GetAsset` continues to resolve only AssetLibrary entities and does not fall back to the generated-output index.
- Require an explicit promote/add-to-library action before a generated output receives AssetLibrary identity and becomes visible to `ListAssets`/`GetAsset`.
- Update Agent follow-up context and tests so generated output ids are routed through resource access, while promoted AssetLibrary ids remain routed through asset capabilities.
- Add focused Evaluation coverage for the real TUI path, including generated resource use, forbidden `GetAsset` routing before promotion, terminal task completion, and durable output evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `generated-asset-lifecycle`: Clarify that a generated draft/output record is not an AssetLibrary entity and gains AssetLibrary identity only through explicit promotion/addition.

## Impact

- Agent task-result normalization and follow-up prompt projection in `packages/neko-agent/packages/agent`.
- TUI and Extension content capability assembly, which must receive the canonical SQLite-backed ResourceCache metadata store and generated-output lookup before constructing content access.
- Media task result projection and Extension delivery tests in `packages/neko-agent/packages/platform` and `packages/neko-agent/packages/extension`.
- Asset capability contract tests in `packages/neko-assets`; behavior remains strict rather than adding a generated-index fallback.
- Focused Agent Evaluation suites and evidence for generated media follow-up routing.
- No project-file, Engine, Protobuf, Webview visual, or AssetLibrary storage migration is introduced. Existing generated files and generated-output index records remain intact.
