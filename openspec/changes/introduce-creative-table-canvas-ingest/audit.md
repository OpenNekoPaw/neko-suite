## Boundary Audit

Date: 2026-06-30

### Reuse

- `CanvasMarkdownCapabilityInput` / `CanvasMarkdownCapabilityResult` in `@neko/shared` are already the cross-package Agent Webview -> Agent Extension -> Canvas contract. Extend this boundary instead of adding a new package or reintroducing `@neko/draft-runtime`.
- `invokeCanvasMarkdownCapability` / `canvasMarkdownCapabilityResult` Webview messages already provide a typed request/response route. Keep the message kind and allow it to carry the new ingest capability input.
- Canvas `invokeCanvasMarkdownCapability` already owns validation, resource binding, node creation, and diagnostics. Keep implementation in `neko-canvas`.
- Existing `AgentCapabilityInvocationResult` and lifecycle approval handling already represent follow-up actions and `waiting-approval`. Reuse that result envelope for Canvas ingest follow-up actions.
- Plugin transfer remains valid for ordinary asset transfer (`singleAsset`, `assetBatch`) and Cut storyboard handoff, but not for Markdown-to-Canvas authoring.

### Extend

- Add `canvas.ingestMarkdown` to Canvas Markdown capability ids and DTO union.
- Add result metadata for `resolvedKind`, creative profile id, display fallback, and field roles.
- Add profile/intent hints to Markdown inputs without making Webview the authority for profile resolution.
- Extend validators to cover creative field roles, resolved kinds, profile hints, intent hints, and malformed action/profile metadata.
- Extend Canvas table metadata to preserve Table Core rows/columns/cells/media bindings for both generic and creative tables.

### Keep Canvas-private

- Markdown table parsing, profile registry, alias matching, validation rules, resource token extraction, and production node creation stay Canvas-owned implementation details until a second package needs pure helpers.
- Built-in profile descriptors such as `storyboard` are Canvas-owned. Shared DTOs carry profile ids and result metadata, not the full implementation.

### Remove Or Fail-close

- New Markdown-to-Canvas requests must not return success through `canvasStructuredContent`, `canvasStoryboard`, direct storyboard compiler payloads, `@neko/storyboard-draft`, `@neko/draft-runtime`, or `StoryboardDraftNormalized`.
- `storyboard-draft` may remain as a profile/capability alias during migration, but new architecture text and tests should treat storyboard as a Creative Table profile.

### Current Gaps

- Webview presenter currently infers any GFM table as `canvas.createTableFromMarkdown`.
- Canvas has hardcoded generic/storyboard profile constants but no validated Creative Table profile descriptor with `approval` / `plan` / `execution` field roles.
- Canvas lifecycle result actions are appended as text in Webview instead of rendered as actionable controls.
- Skill guidance still names `canvas.createStoryboardDraftFromMarkdown` as the preferred Canvas review action rather than a unified ingest/creative table handoff.
