## 1. Contracts and Core Service

- [ ] 1.1 Define local resource access contracts for root providers, projection results, authorization status, and Webview configuration options.
- [ ] 1.2 Implement a VSCode `LocalResourceAccessService` that aggregates extension asset roots, workspace roots, media-library roots, extension cache roots, and workspace generated cache roots.
- [ ] 1.3 Add path normalization and containment checks that reject filesystem root, user home, and system temp root as broad authorization roots.
- [ ] 1.4 Implement `toWebviewUri` behavior for authorized local files, pass-through remote URLs, and explicit unauthorized results.
- [ ] 1.5 Add unit tests for root aggregation, deduplication, containment, remote URL pass-through, and unauthorized path handling.

## 2. neko-assets Media Library Integration

- [ ] 2.1 Add a stable `neko.assets.getMediaLibraryRoots` command or provider API that returns resolved enabled media-library roots with local overrides applied.
- [ ] 2.2 Add media-library change notification support so consumers can refresh active Webview roots.
- [ ] 2.3 Ensure media-library add/update flows validate directory existence and readability before saving configuration.
- [ ] 2.4 Add tests for resolved root export, disabled libraries, local overrides, and root update notifications.

## 3. Agent Migration

- [ ] 3.1 Replace Agent Chat Webview `localResourceRoots` assembly with the unified local resource access service.
- [ ] 3.2 Replace Agent tool-result media projection in `agentStreamProcessor` with the unified resolver.
- [ ] 3.3 Replace Agent conversation, task, and generated-media Webview URI helpers with the unified resolver.
- [ ] 3.4 Keep document image extraction under `globalStorageUri/document-image-cache` and register that cache through the unified service.
- [ ] 3.5 Add tests covering ReadDocument image thumbnails, generated media results, unauthorized paths, and media-library-backed paths in Agent Chat.

## 4. Cross-Package Webview Migration

- [ ] 4.1 Migrate `neko-canvas` local asset projection and Webview root configuration to the unified service.
- [ ] 4.2 Migrate `neko-cut` video editor roots and local media projection to the unified service while preserving project-adjacent media access.
- [ ] 4.3 Migrate `neko-tools` media diff and asset variant diff providers to the unified service.
- [ ] 4.4 Migrate `neko-story` preview panel thumbnail and asset URI projection to the unified service.
- [ ] 4.5 Migrate `neko-model`, `neko-preview`, `neko-audio`, and `neko-live` media-capable Webviews where they display local files.

## 5. Cache and Temp Path Governance

- [ ] 5.1 Audit runtime `os.tmpdir()` usages and classify each as internal scratch or previewable output.
- [ ] 5.2 Move previewable temp outputs from system temp into extension `globalStorageUri` caches or workspace `.neko/.cache` roots.
- [ ] 5.3 Register approved cache roots with the local resource access service.
- [ ] 5.4 Add tests that system temp files are not projected into Webviews unless copied to an authorized cache root.

## 6. Guardrails and Documentation

- [ ] 6.1 Add developer documentation describing path categories, media-library roots, cache roots, and Webview authorization rules.
- [ ] 6.2 Add a lint, test, or scripted check for new direct `webview.asWebviewUri(vscode.Uri.file(...))` usage outside approved adapters.
- [ ] 6.3 Add a lint, test, or scripted check for ad hoc `localResourceRoots` assembly outside approved Webview configuration helpers.
- [ ] 6.4 Document user-facing remediation when a local path is outside authorized roots.

## 7. Verification

- [ ] 7.1 Run focused unit tests for local resource access, `neko-assets`, and migrated Agent paths.
- [ ] 7.2 Run package-level tests for migrated Webview providers.
- [ ] 7.3 Manually verify external media-library image/video previews in Agent Chat and at least one editor Webview.
- [ ] 7.4 Manually verify document thumbnail previews no longer use system temp Webview roots.
