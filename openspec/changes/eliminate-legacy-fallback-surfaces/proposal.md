## Why

The previous fallback/legacy governance pass fixed the highest-risk Agent paths, but the repository still reports 739 non-test legacy/fallback/deprecated matches. Neko Suite is prelaunch, so this is the right time to finish the cleanup by migrating removable compatibility paths, renaming benign fallback vocabulary, and making every retained bridge explicit, owned, and testable.

## What Changes

- **BREAKING** Remove or reject all remaining `delete-now` and `migrate-now` production compatibility paths instead of keeping dual-read/dual-write or old command aliases.
- Migrate Agent centralized compatibility tool registration out of `toolBootstrap` into owning package `AgentCapabilityProvider`s.
- Complete the AI SDK legacy media bridge sunset by migrating provider types to native/generic AI SDK resolution or explicitly marking unsupported provider types with fail-closed diagnostics.
- Remove remaining command/API fallback callers for `neko.assets.getAllEntities`; keep the command only until Story/Tools callers are migrated, then delete the command registration.
- Rename benign `fallback*` identifiers that represent defaults, display-name hints, UI slots, or file-name hints to `default*`, `*Hint`, `emptyState*`, or React-specific names.
- Keep true local-client resilience only at real boundaries: VSCode/Webview sandbox, CSP/resource URI projection, Extension/Engine communication, local file/path access, media codec/Range handling, async cancellation, external AI/market providers, user data, and trust/security boundaries.
- Update debt ledgers and scanner expectations so production `needs-review`, `delete-now`, and `migrate-now` counts are zero, and retained `current-bridge` / `runtime-resilience` entries have owner, replacement or reason, removal condition, and validation.

## Capabilities

### New Capabilities

- `legacy-fallback-surface-elimination`: Covers repository-wide classification, migration/removal, naming cleanup, retained bridge governance, and validation requirements for legacy/fallback/deprecated surfaces.

### Modified Capabilities

None.

## Impact

- `packages/neko-agent/packages/ai-sdk/src/*`, `packages/neko-agent/packages/platform/src/media/*`, and provider adapter tests for legacy bridge sunset.
- `packages/neko-agent/packages/extension/src/bootstrap/toolBootstrap.ts` and owning package capability providers for document, media/image, and search/semantic coverage tools.
- `packages/neko-assets/src/extension.ts`, `packages/neko-story`, `packages/neko-tools`, and Canvas/Story/Tools asset entity lookup callers.
- `packages/neko-types`, `packages/neko-ui`, Webview packages, and Extension packages where benign `fallback*` names should be renamed or explicitly classified.
- `quality/ledgers/code-debt-surface-ledger.json`, `quality/ledgers/agent-code-debt-lcd-register.json`, `scripts/check-legacy-debt-surfaces.mjs`, and ADR docs for updated baseline and enforcement.
- Focused tests for migrated paths, poisoned legacy paths, fail-closed diagnostics, and scanner/ledger quality gates.
