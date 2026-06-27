## 1. Shared Bridge Baseline

- [x] 1.1 Audit all production Webview direct `acquireVsCodeApi`, package-local bridge wrappers, global API shims, and shared bridge imports; record the migration target for each package.
- [x] 1.2 Review `@neko/shared/vscode` exported types and helpers against the new `webview-vscode-bridge` spec; add missing type exports or small helper gaps without importing React, VSCode, Node, or feature packages.
- [x] 1.3 Add focused shared tests for singleton acquisition, repeated caller behavior, non-VS Code no-op behavior, `postMessage`, `getState`, and `setState`.
- [x] 1.4 Add focused shared tests for `sendRequest` success, error response, timeout, cancellation, and pending request cleanup.
- [x] 1.5 Add or document a shared bridge test setup pattern so package Webview tests do not each invent incompatible global API mocks.

## 2. Typed Facade Migration

- [x] 2.1 Migrate already-close packages (`neko-agent`, `neko-cut`, `neko-tools`) so their bridge exports consistently delegate to `@neko/shared/vscode` and no duplicate singleton logic remains.
- [x] 2.2 Migrate simple wrapper packages (`neko-dashboard`, `neko-market`, `neko-live`) to typed facades over `@neko/shared/vscode` while preserving existing message helper names and payload semantics.
- [x] 2.3 Migrate `neko-preview` bridge and document-state helpers to shared bridge access while preserving restore/save-state message behavior.
- [x] 2.4 Migrate app-root direct acquisition in `neko-canvas`, `neko-sketch`, `neko-story`, `neko-audio`, `neko-model`, and `neko-puppet` to shared bridge access or package-local typed facades.
- [x] 2.5 Replace component-level global API access such as `__vscode_api__` or `__vscodeApi` with imported or injected package facades.
- [x] 2.6 Delete obsolete duplicate singleton wrappers after all production callers are migrated, or mark any retained wrapper as a thin deprecated re-export with owner and removal condition.

## 3. Message and State Behavior Preservation

- [x] 3.1 Add or update package tests proving migrated ready messages still post for representative Webviews.
- [x] 3.2 Add or update package tests proving migrated typed domain message builders keep their previous payload shape.
- [x] 3.3 Add or update Preview/document viewer tests proving persisted Webview session state still restores and saves through the existing Extension message contract.
- [x] 3.4 Add or update tests for any migrated request-response flow that uses `_requestId`, including success and error responses.
- [x] 3.5 Confirm Webview state helpers are used only for recoverable UI/session state and not for durable project facts or runtime stream/blob/Webview URI handles.

## 4. Guardrails and Boundary Checks

- [x] 4.1 Add a production-source guardrail that flags direct `acquireVsCodeApi()` usage under `packages/*/packages/webview/src` outside `@neko/shared/vscode` or approved migration/test files.
- [x] 4.2 Add a guardrail or extend existing boundary tests to ensure Webview code still does not import `vscode`, Node filesystem modules, or Extension implementation modules.
- [x] 4.3 Add actionable diagnostics for the bridge guardrail that point developers to `@neko/shared/vscode` and package-local typed facades.
- [x] 4.4 Document the bridge layering rule in the relevant architecture/package-boundary docs only if the stable rule is not already clear after the guardrail is added.

## 5. Validation

- [x] 5.1 Run focused shared-package tests for `@neko/shared/vscode`.
- [x] 5.2 Run focused package tests for each migrated Webview group after migration.
- [x] 5.3 Run dependency and boundary checks covering Webview sandbox constraints and the new bridge duplication guardrail.
- [x] 5.4 Run `pnpm check` or the smallest reliable equivalent that includes the new guardrail.
- [x] 5.5 Run `pnpm smoke:webview:runtime` or focused `vscode-extension-debugger` validation for representative migrated paths: ready message, postMessage domain action, state restore/save, and request-response.
- [x] 5.6 Run `openspec validate standardize-webview-vscode-bridge` and record any residual validation gaps before implementation is considered complete.

## 6. Post-Completion Fallback Hardening

- [x] 6.1 Remove package-local mock `postMessage` fallback behavior from migrated Preview and Audio facades so non-VS Code behavior is owned only by `@neko/shared/vscode` and shared test utilities.
- [x] 6.2 Remove remaining production global bridge access and legacy facade surface found after the first migration pass, including Canvas `window.vscode` access and Live's unused `getVscodeApi` legacy export.
- [x] 6.3 Delete obsolete Webview `Window.acquireVsCodeApi` declarations from migrated packages when production code no longer reads that browser API directly.
- [x] 6.4 Extend `pnpm check:webview-boundaries` to fail on production legacy bridge shims, direct `window.vscode` / `window.vscodeApi` access, and package-local mock bridge fallbacks.
- [x] 6.5 Re-run focused bridge, Webview package, guardrail, and OpenSpec validation after the fallback cleanup.
