## 1. Architecture Documents And Contracts

- [x] 1.1 Update `docs/architecture/marketplace-plugin-governance.md` to make local Workspace Trust store authority explicit and demote project-local trust files to provenance hints.
- [x] 1.2 Resolve the `process-spawn` policy wording so the document states one deterministic rule for T1 and T2 publishers.
- [x] 1.3 Replace sideload absolute path examples with `${NEKO_HOME}`, `${WORKSPACE}`, or PathResolver variable paths.
- [x] 1.4 Clarify copy-managed local install versus explicit local-link semantics, including uninstall behavior.
- [x] 1.5 Align plugin build API summaries with `registry-server-contract.md` so request bodies do not include authoritative `userId`.
- [x] 1.6 Add shader/model sideload validation requirements to governance and marketplace architecture docs.

## 2. Shared Manifest And Local Registry Types

- [x] 2.1 Extend shared manifest/local install types to represent copied local sources and explicit local-link sources without persisting original absolute paths by default.
- [x] 2.2 Ensure `PluginMetadata` remains native-only and includes entry point, host API version, permissions, engine requirements, target triple, and `cdylib` runtime artifact constraints.
- [x] 2.3 Ensure `AssetDistribution.publisher.verified` is the primary verified publisher field while legacy `verified` remains compatibility-only.
- [x] 2.4 Add or update validation helpers for plugin permission declarations, `networkHosts`, target triple compatibility, and high-sensitive permission diagnostics.
- [x] 2.5 Add metadata/probe result types needed for shader and model sideload validation.

## 3. Market Runtime And Local Install Flow

- [x] 3.1 Implement local Workspace Trust authority keyed by workspace fingerprint outside project-controlled files.
- [x] 3.2 Add migration handling for existing project-local trust records with explicit user confirmation before importing trusted state.
- [x] 3.3 Update install preflight to block unverified native plugins before download or staging.
- [x] 3.4 Update plugin preflight to reject incompatible target triples before download where artifact metadata is available.
- [x] 3.5 Implement copy-managed local install storage under `${NEKO_HOME}/local/<type>/...` with a separate local installed registry.
- [x] 3.6 Implement explicit local-link mode where uninstall removes only the local install record.
- [x] 3.7 Prevent sideload assets from participating in market updates, entitlement refresh, publisher verification, rating, recommendation, or bundle contents.
- [x] 3.8 Enforce Developer Mode plus trusted workspace before local native plugin activation.
- [x] 3.9 Add shader and model local validation hooks for format parsing, compatibility checks, resource limits, and blocked diagnostics.

## 4. Registry Client And Auth Boundaries

- [x] 4.1 Update plugin build client calls to send version, target triple, and session id while deriving user identity from Bearer auth.
- [x] 4.2 Add typed support for plugin build status and build result polling where missing.
- [x] 4.3 Ensure publisher verification status is server-owned and cannot be synthesized from local display data.
- [x] 4.4 Add or update permission violation audit reporting with retry/local retention behavior when capability or network support is unavailable.
- [x] 4.5 Ensure paid plugin build/download flows check server entitlement before build or download requests.

## 5. Marketplace UI And Extension Surfaces

- [x] 5.1 Add Installed tab Local badges and local-only action sets for sideload assets.
- [x] 5.2 Add local install confirmation UI that distinguishes copy-managed installs from explicit local links.
- [x] 5.3 Add Developer Mode enable/disable/status UI with risk acknowledgement, expiration display, and active indicator.
- [x] 5.4 Add Workspace Trust state and promotion UI that explains blocked sideload/native plugin activation.
- [x] 5.5 Add type-specific sideload warnings for native plugins, shader binaries, models, and low-risk text/config assets.
- [x] 5.6 Ensure webview/extension communication for new UI flows uses typed postMessage contracts and preserves webview sandbox constraints.

## 6. Engine Plugin Loading And Audit

- [x] 6.1 Update PluginManager loading flow to run integrity, signature, license, trust tier, Workspace Trust, target triple, and machine binding checks before native load.
- [x] 6.2 Ensure engine license checks are authoritative and cannot be bypassed by TypeScript UI state.
- [x] 6.3 Add host-api audit events for undeclared permission use and reporting payloads containing plugin id, permission, declared=false, timestamp, and watermark/session context when available.
- [x] 6.4 Keep direct native syscall limitations explicit in engine errors/docs and avoid presenting host-api audit as sandbox enforcement.
- [x] 6.5 Add coarse-grained `system-info` host API behavior for plugin callers.

## 7. Verification

- [x] 7.1 Add unit tests for manifest validation, verified publisher projection, plugin permission diagnostics, and local source shape handling.
- [x] 7.2 Add market runtime tests for Workspace Trust authority, sideload isolation, Developer Mode expiry, and bundle sideload rejection.
- [x] 7.3 Add registry client tests for plugin build request shape, entitlement-before-build ordering, and permission audit reporting.
- [x] 7.4 Add UI tests for Local badges, Developer Mode state, Workspace Trust promotion, and type-specific sideload warnings.
- [x] 7.5 Add engine tests for plugin load gate ordering, target triple rejection, license denial, and host-api audit events.
- [x] 7.6 Run `pnpm check` and focused market/engine test suites; run broader `pnpm test` if shared contracts or cross-package behavior changed.
