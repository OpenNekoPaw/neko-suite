## 1. Contract And Regression Coverage

- [x] 1.1 Add shared provider tests that poison source-copy success and require bounded, materially transformed generated thumbnails.
- [x] 1.2 Add generated-source content access tests for Agent bytes, local paths, and Webview projection without ResourceCache materialization.

## 2. Canonical Source And Derivative Paths

- [x] 2.1 Introduce the generated-source content access provider and register it before generic ResourceCache access in Extension and TUI hosts.
- [x] 2.2 Narrow `GeneratedAssetDerivativeResourceCacheProvider` to bounded thumbnail requests through an injected image variant generator and remove generated preview source-copy success.
- [x] 2.3 Add the Extension Sharp adapter, update TUI assembly to avoid registering an unavailable thumbnail generator, and migrate affected callers.

## 3. Documentation And Validation

- [x] 3.1 Update cache architecture documentation to define source projection versus image thumbnail/preview materialization.
- [x] 3.2 Run focused shared, Extension, and TUI tests plus affected package typecheck/build validation.
- [x] 3.3 Run `git diff --check`, inspect legacy/duplicate paths, and complete the L2 Neko quality review with residual risks recorded.
