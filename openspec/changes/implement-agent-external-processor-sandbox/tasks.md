## 1. Contracts And Validators

- [x] 1.1 Add `ExternalProcessorManifest`, root alias, env profile, processor policy, invocation, result, diagnostic, run/stage provenance, and retention DTOs in the shared Agent/shared type layer.
- [x] 1.2 Implement JSON manifest validator for `schema="neko.externalProcessor"` and `schemaVersion=1`, including required fields, argument templates, root aliases, output declarations, env profile, network, timeout, and approval policy diagnostics.
- [x] 1.3 Add typed diagnostics for unknown schema/version, invalid root alias, illegal output root, undeclared input/output parameter, unsupported env request, non-portable output, and disabled/untrusted processor.
- [x] 1.4 Add contract tests for valid manifests, unknown schema rejection, invalid root aliases, illegal env inheritance, and non-JSON author-input conversion boundaries.

## 2. ExternalProcessorRegistry

- [x] 2.1 Implement `ExternalProcessorRegistry` with `upsert`, `unregister`, `setEnabled`, `list`, `resolve`, immutable registration snapshots, revision tracking, and `onDidChange`.
- [x] 2.2 Add registry projection for builtin processors and project manifests under `.neko/processors/*.neko-processor.json`.
- [x] 2.3 Add personal/local registry persistence and explicit Settings/UI/CLI registration hooks without scanning HOME, PATH, Downloads, Desktop, or arbitrary install directories.
- [x] 2.4 Add Market install target projection for processor packages, including publisher/package/version/trustLevel/entitlement/revocation diagnostics and uninstall lifecycle.
- [x] 2.5 Add extension/plugin contribution projection through Extension Host registry only, with no Webview direct loading.
- [x] 2.6 Add registry tests for five source scopes, trust mapping, disabled state, update snapshots, unregister, Market uninstall, project file deletion, personal manifest removal, extension deactivation, and stale invocation snapshot behavior.

## 3. Agent Runtime Integration

- [x] 3.1 Add Agent runtime processor catalog access through registry projection without reading raw source directories, Market records, or extension contribution internals.
- [x] 3.2 Add processor invocation planning and result handling that returns structured diagnostics, `ResourceRef`, provenance, and run/stage metadata.
- [x] 3.3 Disable arbitrary `Bash` injection for ordinary creative Agent sessions and add tests proving default tool allowlists do not contain shell execution.
- [x] 3.4 Route Developer Mode one-shot commands through temporary processor requests with the same path/env/output/approval policy and no persistent `Bash(*)` allow.
- [x] 3.5 Add chain orchestration support for explicit per-stage processor invocations with `processorRunId`, `stageId`, attempt metadata, parent provenance, and cross-turn approval continuation.
- [x] 3.6 Add Agent runtime tests for default no-Bash behavior, processor capability injection gates, approval continuation across turns, stage retry attempts, target-change new run creation, and shell pipeline rejection.

## 4. Host Execution And Path Policy

- [x] 4.1 Implement Extension Host processor execution adapter that resolves registration snapshots, validates cwd, allocates output paths, applies timeout/resource limits, and spawns only manifest-declared executable/args.
- [x] 4.2 Implement processor root alias resolution for `workspace`, `mediaLibrary`, `resourceCache`, and `extensionPrivateResources`.
- [x] 4.3 Integrate `PathAccessPolicy` for processor input/output authorization, including workspace, media library, project resource cache, extension private resources, and denial of system temp/Downloads/Desktop/undeclared absolute paths.
- [x] 4.4 Implement env profile builder with explicit allowlist, configured/runtime env, Host baseline secret denylist, and diagnostics for blocked or unknown keys.
- [x] 4.5 Implement network default-deny behavior or fail-visible diagnostic when the current runtime cannot enforce requested network policy.
- [x] 4.6 Add Host tests for output root allocation, path denial, media library read-only behavior, env secret blocking, GPU/Python/Blender env profiles, timeout handling, network diagnostics, and fixed executable/args spawning.

## 5. Resource Cache And ProcessorResourcePort

- [x] 5.1 Define `ProcessorResourcePort` as a host-agnostic interface for retention hints, resource status, pin/unpin, intermediate/debug/promoted marking, and promote/create-asset requests.
- [x] 5.2 Bind `ProcessorResourcePort` in Extension Host to `ResourceCacheService`, `LocalResourceAccessService`, and Asset/Project services without importing VS Code or cache implementations into Agent runtime.
- [x] 5.3 Extend resource cache metadata as needed for processor run/stage provenance, retention hints, pinned/session-active state, and promoted status.
- [x] 5.4 Implement P0/P1 processor cache GC: budget-triggered LRU, pinned/session-active/promoted/non-rebuildable/outside-root skip rules, debug retention, and manifest status update after deletion.
- [x] 5.5 Implement promote/create-asset flow for processor outputs so durable results move from scratch cache to Asset/Project-owned source refs.
- [x] 5.6 Add tests proving Agent runtime only emits resource intent, Host binding calls `ResourceCacheService`, intermediate outputs become GC-eligible, failed-chain outputs retain debug status, pinned outputs survive GC, and promoted outputs leave scratch lifecycle.

## 6. Webview And Resource Handoff Cleanup

- [x] 6.1 Update Agent document/image/processor output handoff to use `ResourceRef`, document source refs, workspace-relative paths, or `${VAR}/path` instead of naked absolute paths.
- [x] 6.2 Remove or poison Agent-facing system temp display paths so temp image handoff returns fail-visible diagnostics instead of successful Webview projection.
- [x] 6.3 Ensure Agent Webview, Canvas send, storyboard generation, and composite artifacts preserve image/resource references according to `packages/neko-agent/DOCUMENT_FORMATS.md`.
- [x] 6.4 Update LocalResourceAccess/Webview projection paths so resource cache outputs display through `webview.asWebviewUri(...)` and unauthorized paths log/return diagnostics.
- [x] 6.5 Add Extension/Webview tests for managed resource display, temp path rejection, Canvas send reference preservation, storyboard reference preservation, and CSP/localResourceRoots behavior.

## 7. Market, Assets, And Media Library Integration

- [x] 7.1 Add or update Market manifest/install-target handling for processor packages with trustLevel, entitlement, publisher, version, revocation, and uninstall lifecycle.
- [x] 7.2 Add media library input resolution using existing `ResolvedMediaLibrary`/`PathVariableMap` rules, with accessible/enabled/policy checks.
- [x] 7.3 Ensure processor outputs cannot write to media library roots by default and require explicit Create Asset / Promote / Link to persist results there.
- [x] 7.4 Add tests for Market untrusted non-auto-execution, Market revocation blocking resolution, media library read input, media library default write denial, and promoted `${VAR}/path` or AssetEntity output.

## 8. Legacy Cleanup And Documentation

- [x] 8.1 Remove legacy compatibility shims or fallback branches that treat `cachePath`, system temp paths, Webview URI, file URL, or runtime token as durable Agent/Canvas/storyboard resource identity.
- [x] 8.2 Update ADR references, package docs, and developer docs to point to the canonical External Processor, ResourceRef, and cache path rules.
- [x] 8.3 Update fixtures that used temp paths or naked absolute cache paths to managed `ResourceRef` or source-ref fixtures.
- [x] 8.4 Add diagnostics documentation for common setup failures: missing executable, blocked env key, unauthorized root, no network policy, non-portable output, disabled trust, and GC missing variant.

## 9. Validation

- [x] 9.1 Run focused unit tests for agent-types/shared contracts and validators.
- [x] 9.2 Run focused Agent runtime tests for tool allowlists, capability injection, Developer Mode, chain run/stage behavior, and approval policy.
- [x] 9.3 Run focused Extension Host tests for processor execution, path policy, resource cache binding, local resource projection, and Market lifecycle.
- [x] 9.4 Run `pnpm check:agent-boundaries` and `pnpm check:webview-boundaries`.
- [x] 9.5 Run `pnpm check:legacy-debt` or record why another quality command covers legacy temp/cachePath cleanup.
- [x] 9.6 Run `pnpm test`.
- [x] 9.7 Run `pnpm check`.
- [x] 9.8 Run `pnpm build`.
- [x] 9.9 Run `pnpm smoke:webview:runtime` or `pnpm smoke:vscode-debugger` for VS Code Webview resource display/CSP validation.
- [x] 9.10 Record residual risks for OS-level sandbox deferral, default cache budget tuning, and any remaining migration-only compatibility paths.

## Residual Risks

- OS-level sandboxing remains deferred beyond P0/P1. The current boundary is manifest-gated processor execution, `PathAccessPolicy`, explicit root aliases, env/network/timeout/approval policy, and no ordinary creative-session `Bash(*)`; a future native/container sandbox can wrap the Host adapter without changing Agent planning contracts.
- Default processor cache byte budgets and debug TTLs are intentionally conservative and should be product-tuned against real image/video processor workloads. GC ownership stays in `ResourceCacheService`, and processor outputs must remain under `.neko/.cache/resources` or extension-private resource roots until promoted.
- Migration-only compatibility for legacy `cachePath`, system temp paths, Webview URIs, file URLs, and runtime tokens must remain fail-visible and must not return successful Agent/Canvas/storyboard resource identity. `pnpm check:legacy-debt`, focused resource handoff tests, and Webview projection tests are the guardrails for keeping those paths quarantined.
- `pnpm smoke:webview:runtime` validated the VS Code remote debugging runtime surface and observed visible Webview targets including `neko.neko-agent` on port `9222`. Scenario-specific resource display remains covered by the Extension/Webview tests added for managed resource projection, temp path rejection, Canvas reference preservation, storyboard reference preservation, and CSP/localResourceRoots behavior.
