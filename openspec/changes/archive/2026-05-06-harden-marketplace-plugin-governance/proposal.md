## Why

Native marketplace plugins are loaded as neko-engine `cdylib` artifacts with process-level authority, so governance rules must be precise enough that client, server, and engine implementations cannot diverge. The current architecture document correctly rejects runtime sandbox claims, but several rules still need to be tightened before implementation: Workspace Trust authority, sideload path semantics, sensitive permission policy, shader/model local validation, and registry API ownership.

## What Changes

- Introduce an explicit native plugin governance capability covering verified publisher rules, declarative permissions, host-api audit limits, Developer Mode, Workspace Trust enforcement, and engine-side license gates.
- Harden Workspace Trust so trusted state is held in a local machine-owned trust store keyed by workspace fingerprint, not treated as authoritative when read from project files.
- Clarify sideload semantics across AssetTypes: local installs are physically isolated under `${NEKO_HOME}/local`, use variable-based paths, distinguish copied local assets from external local links, and never participate in market publishing, entitlement, updates, or bundle contents.
- Tighten shader and model sideload validation with source warnings plus resource, format, and compiler/runtime checks before activation.
- Align plugin build and publisher verification API usage so client-facing contracts derive user identity from Bearer auth and do not duplicate stale request bodies in governance docs.
- Clarify high-sensitive plugin permission policy so `process-spawn`, `network:any`, filesystem writes, and system information exposure have unambiguous review and UI disclosure rules.

## Capabilities

### New Capabilities
- `market-plugin-governance`: Native plugin and engine artifact governance, including trust tiers, permission disclosure, host-api audit boundaries, Developer Mode, Workspace Trust gates, and plugin license loading rules.

### Modified Capabilities
- `market-manifest-contract`: Local and registry manifests must represent plugin metadata, publisher verification, sideload source shape, and shader/model validation metadata without weakening the v4 schema.
- `market-install-runtime`: Install and activation preflight must enforce plugin governance, Workspace Trust, local asset isolation, and sideload activation rules.
- `market-registry-client-contract`: Plugin build, publisher verification, permission audit, and entitlement calls must remain server-driven and Bearer-auth scoped.
- `marketplace-management-surfaces`: Installed and local asset management surfaces must expose Developer Mode, Local badges, sideload warnings, and Workspace Trust promotion without bypassing governance gates.

## Impact

- Affected docs: `docs/architecture/marketplace-plugin-governance.md`, `docs/architecture/manifest-schema-spec.md`, `docs/architecture/marketplace.md`, and `docs/architecture/registry-server-contract.md`.
- Affected packages when implemented: `packages/neko-market` core/extension/webview, shared asset manifest types, and `packages/neko-engine/host-api` PluginManager/license/audit surfaces.
- No new runtime sandbox is introduced; this change explicitly preserves the in-process plugin architecture while making trust, review, and activation decisions deterministic and testable.
