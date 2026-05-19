## 1. Contracts and Core Service

- [x] 1.1 Define local resource access contracts for root providers, projection results, authorization status, and Webview configuration options.
- [x] 1.2 Implement a VSCode `LocalResourceAccessService` that aggregates extension asset roots, workspace roots, media-library roots, extension cache roots, and workspace generated cache roots.
- [x] 1.3 Add path normalization and containment checks that reject filesystem root, user home, and system temp root as broad authorization roots.
- [x] 1.4 Implement `toWebviewUri` behavior for authorized local files, pass-through remote URLs, and explicit unauthorized results.
- [x] 1.5 Add unit tests for root aggregation, deduplication, containment, remote URL pass-through, and unauthorized path handling.

## 2. neko-assets Media Library Integration

- [x] 2.1 Add a stable `neko.assets.getMediaLibraryRoots` command or provider API that returns resolved enabled media-library roots with local overrides applied.
- [x] 2.2 Add media-library change notification support so consumers can refresh active Webview roots.
- [x] 2.3 Ensure media-library add/update flows validate directory existence and readability before saving configuration.
- [x] 2.4 Add tests for resolved root export, disabled libraries, local overrides, and root update notifications.

## 3. Agent Migration

- [x] 3.1 Replace Agent Chat Webview `localResourceRoots` assembly with the unified local resource access service.
- [x] 3.2 Replace Agent tool-result media projection in `agentStreamProcessor` with the unified resolver.
- [x] 3.3 Replace Agent conversation, task, and generated-media Webview URI helpers with the unified resolver.
- [x] 3.4 Route Agent search-result media display through `neko-search` host/source-ref resolution before local resource projection.
- [x] 3.5 Route Agent entity/asset representation display through `neko-entity`, `AssetRefResolver`, or owner-domain resolution before local resource projection.
- [x] 3.6 Keep document image extraction under `globalStorageUri/document-image-cache` and register that cache through the unified service.
- [x] 3.7 Add tests covering ReadDocument image thumbnails, generated media results, unauthorized paths, media-library-backed paths, search-result paths, and entity/asset representation paths in Agent Chat.

## 4. Cross-Package Webview Migration

- [x] 4.1 Migrate `neko-canvas` local asset projection and Webview root configuration to the unified service.
- [x] 4.2 Migrate `neko-cut` video editor roots and local media projection to the unified service while preserving project-adjacent media access.
- [x] 4.3 Migrate `neko-tools` media diff and asset variant diff providers to the unified service.
- [x] 4.4 Migrate `neko-story` preview panel thumbnail and asset URI projection to the unified service.
- [x] 4.5 Migrate `neko-model`, `neko-preview`, `neko-audio`, and `neko-live` media-capable Webviews where they display local files.

## 5. Cache and Temp Path Governance

- [x] 5.1 Audit runtime `os.tmpdir()` usages and classify each as internal scratch or previewable output.
- [x] 5.2 Move previewable temp outputs from system temp into extension `globalStorageUri` caches or workspace `.neko/.cache` roots.
- [x] 5.3 Register approved cache roots with the local resource access service.
- [x] 5.4 Add tests that system temp files are not projected into Webviews unless copied to an authorized cache root.

## 6. Guardrails and Documentation

- [x] 6.1 Add developer documentation describing path categories, media-library roots, cache roots, and Webview authorization rules.
- [x] 6.2 Add a lint, test, or scripted check for new direct `webview.asWebviewUri(vscode.Uri.file(...))` usage outside approved adapters.
- [x] 6.3 Add a lint, test, or scripted check for ad hoc `localResourceRoots` assembly outside approved Webview configuration helpers.
- [x] 6.4 Add boundary tests that local resource access does not read `neko-search` cache files, entity fact files, binding files, or asset metadata stores as semantic authorities.
- [x] 6.5 Document user-facing remediation when a local path is outside authorized roots.

## 7. Verification

- [x] 7.1 Run focused unit tests for local resource access, `neko-assets`, and migrated Agent paths.
- [x] 7.2 Run package-level tests for migrated Webview providers.
- [x] 7.3 Verify `neko-search` and `neko-entity` boundary tests continue to pass after local resource access integration.
- [ ] 7.4 Manually verify external media-library image/video previews in Agent Chat and at least one editor Webview.
- [x] 7.5 Manually verify document thumbnail previews no longer use system temp Webview roots.
