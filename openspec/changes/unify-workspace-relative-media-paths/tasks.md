## 1. Shared Contract And Resolver

- [x] 1.1 Add a shared workspace-relative media path contract with source document URI, owning workspace root, workspace roots, document directory, path variables, and allowed roots.
- [x] 1.2 Implement pure path planning helpers that classify durable refs as workspace-relative, variable, remote URL, absolute local, slash-prefixed migration, or unresolved.
- [x] 1.3 Implement host adapter helpers that build resolution context from a VSCode document URI without importing VSCode into shared L0 code.
- [x] 1.4 Add diagnostics for missing context, unknown variables, multi-root ambiguity, legacy document-relative fallback, unauthorized path, and missing file.
- [x] 1.5 Add unit tests for relative, `${WORKSPACE}`, `${PROJECT}`, custom variable, absolute, slash-prefixed, remote URL, and multi-root cases.

## 2. Canvas Preview And Inline Playback

- [x] 2.1 Route Canvas media import/save normalization through the shared contract so new local media persists as owning-workspace-root-relative paths.
- [x] 2.2 Route Canvas load media projection, `media:probe`, `media:play`, `media:captureFrame`, `openMediaPreview`, and Preview variant fallback through the shared resolver.
- [x] 2.3 Ensure Preview media messages carry session identity, source Canvas URI, and revision before media resolution.
- [x] 2.4 Keep `previewUrl`, durable media source, and `previewPlayableAssetPath` or media session descriptor separate in Preview plan enrichment.
- [x] 2.5 Add focused Canvas tests for reopened `cases/1080P.mp4`, `${WORKSPACE}/cases/test.aac`, `/cases/test.mp4`, `/../cases/test.mp4`, and missing media diagnostics.

## 3. Engine And Preview Boundaries

- [x] 3.1 Add guardrails so supported engine-facing host flows do not pass unresolved relative or variable paths to `neko-client` or engine file access.
- [x] 3.2 Update `EngineClient` usage sites to receive host-resolved existing local paths or registered file tokens for document-scoped media operations.
- [x] 3.3 Update `neko-preview` document/media preview resolution to use source document workspace context instead of first-workspace fallback.
- [x] 3.4 Add tests proving engine-bound probe/play/file-access calls receive resolved local paths and fail visibly when context is missing.

## 4. Assets And Import Dispatch

- [x] 4.1 Update `neko-assets` resolve/contract path command behavior or adapters to accept explicit owning workspace context where available.
- [x] 4.2 Update unified import dispatch planning so workspace files produce durable workspace-relative refs and copied imports produce workspace-relative destination refs.
- [x] 4.3 Preserve external media-library sources as configured variable paths when contraction is available.
- [x] 4.4 Add import dispatch tests for multi-root ownership, copied imports, linked external variable paths, and runtime absolute metadata separation.

## 5. Cut, Audio, And Story Consumers

- [x] 5.1 Update NekoCut project load/save, media proxy, thumbnail, export, and AI/tool media source paths to use the shared workspace-relative context.
- [x] 5.2 Update NekoAudio project load/save and playback/probe paths to use the shared workspace-relative context.
- [x] 5.3 Update Story and storyboard preview/transfer paths to prefer stable resource refs and resolve local path fallbacks through the shared contract.
- [x] 5.4 Add focused regression tests for `.jvi`, `.nka`, and storyboard payloads using workspace-relative, variable, and legacy document-relative media paths.

## 6. Validation And Quality Gates

- [x] 6.1 Run focused shared resolver tests.
- [x] 6.2 Run focused Canvas extension and webview tests covering preview media playback.
- [x] 6.3 Run focused `neko-client`, `neko-preview`, `neko-assets`, `neko-cut`, `neko-audio`, and `neko-story` tests touched by the change.
- [x] 6.4 Run package builds or type checks for changed packages.
- [x] 6.5 Perform Neko quality self-review against `docs/architecture/adr-code-review-quality-gates.md` and document residual risks.
