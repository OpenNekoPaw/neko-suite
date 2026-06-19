## 1. Shared Contracts

- [x] 1.1 Add shared source/catalog/entitlement/diagnostic contracts for account AI catalog snapshots and provider source resolution.
- [x] 1.2 Add source-grouped, capability-scoped model projection types for account gateway and explicit config provider models sent to Webviews.
- [x] 1.3 Add secret-safe projection types for account gateway provider/model state sent to Webviews.
- [x] 1.4 Add focused contract tests or type-level fixtures proving account gateway DTOs do not include token/API-key fields.

## 2. Auth And Account Catalog

- [x] 2.1 Replace or extend the `neko-auth` cloud-token stub with a high-level account AI catalog API/client contract.
- [x] 2.2 Implement Neko official AI catalog and entitlement fetch logic behind an injected HTTP/client boundary.
- [x] 2.3 Store OAuth access/refresh tokens only in the existing auth secret boundary and keep account gateway credentials internal.
- [x] 2.4 Add auth/catalog tests for valid catalog, unauthorized session, entitlement denial, malformed response, and logout invalidation.

## 3. Account Gateway Cache And Refresh

- [x] 3.1 Add an Agent Extension Host account catalog cache with TTL, version/ETag metadata, and explicit invalidation.
- [x] 3.2 Refresh or clear the cache on OAuth login, logout, silent refresh, manual refresh, TTL expiry, version mismatch, and 401/403 responses.
- [x] 3.3 Reuse fresh cached catalog snapshots when opening new Agent tabs instead of forcing a synchronous fetch for every new session.
- [x] 3.4 Add focused cache tests for fresh reuse, expired refresh, logout clear, auth failure invalidation, and manual refresh.

## 4. Provider Source Resolution

- [x] 4.1 Implement explicit AI config detection that ignores non-AI config files but treats explicit provider/model/default selections as authoritative.
- [x] 4.2 Add an account gateway provider/model snapshot source using `connectionKind: gateway`, NewAPI-compatible protocol metadata, and entitlement-filtered models.
- [x] 4.3 Merge explicit config and account gateway snapshots through a resolver that preserves explicit config priority and records the selected source.
- [x] 4.4 Keep invalid explicit AI config fail-visible and prevent fallback to account gateway when explicit provider/model selection is wrong.
- [x] 4.5 Add resolver tests for explicit config win, non-AI config account fallback, invalid explicit config blocking fallback, no source diagnostics, and account entitlement filtering.

## 5. Extension And Webview Projection

- [x] 5.1 Update ConfigBridge to include account gateway provider/model state and account diagnostics in config projections.
- [x] 5.2 Update model projection builders to group Neko official models first after OAuth catalog success, then user-configured providers in config order.
- [x] 5.3 Keep LLM models and domain models such as image, video, audio, and music distinct within each source/provider group.
- [x] 5.4 Hide empty source/type groups in conversation selectors while allowing settings/config views to show configured empty groups with diagnostics.
- [x] 5.5 Update Webview presenters/state to consume account gateway projections without receiving secrets.
- [x] 5.6 Update onboarding/header/settings indicators so OAuth account gateway availability counts as configured while local no-key providers still count correctly.
- [x] 5.7 Add Webview unit tests for source/provider grouping, LLM/domain model separation, empty-group behavior, account session projection, account gateway configured state, local no-key configured state, and secret redaction.

## 6. Conversation Runtime

- [x] 6.1 Pass provider source identity and account gateway provider/model availability into conversation turn assembly.
- [x] 6.2 Reject missing account snapshot, unauthorized selected account model, provider/model mismatch, and stale invalid account catalog before runner configuration.
- [x] 6.3 Add capability validation for workflows that require vision or generation capabilities while allowing text-only chat models for text chat.
- [x] 6.4 Add runtime tests proving no source, invalid account selection, invalid explicit config, and missing capability all fail visibly without provider/model fallback.

## 7. Documentation And Validation

- [x] 7.1 Update Agent README/docs to describe the final two-path AI configuration model, priority rules, account gateway cache policy, and roadmap-scoped direct/generation providers.
- [x] 7.2 Update auth architecture docs after implementation to record the stable account AI boundary and secret rules.
- [x] 7.3 Run focused Vitest suites for shared contracts, auth/catalog, config resolver, ConfigBridge/Webview projection, and conversation runtime.
  - Verified with focused Vitest runs for `neko-types` source contracts, `neko-auth` account catalog/auth bridge, Agent account catalog cache/config resolver/runtime, and Webview config projections.
- [x] 7.4 Run `pnpm -C packages/neko-agent compile:extension`, `pnpm check:agent-boundaries`, `pnpm check:openspec`, and `git diff --check`.
  - `pnpm check:agent-boundaries` passed with existing expired compatibility warnings for `quality-check-tool-bridge` and `consistency-check-tool-bridge`.
- [x] 7.5 If Webview UI behavior changes, run VS Code Extension Development Host smoke with the `vscode-extension-debugger` skill and record residual risk.
  - VS Code Extension Development Host smoke found a nonblank Neko Agent Webview and only the existing `local-network-access` container warning.
