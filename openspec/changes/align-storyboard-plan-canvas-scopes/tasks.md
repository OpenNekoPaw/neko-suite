## 1. Shared Contracts

- [x] 1.1 Add shared storyboard plan overlay contracts for AnimationPlan-style shot overlays, source storyboard refs, overlay diagnostics, durable media refs, and provider-neutral prompt intent.
- [x] 1.2 Add validators/normalizers for storyboard plan overlays, including orphan shot detection and unsafe runtime URL diagnostics.
- [x] 1.3 Add Canvas creative scope and related-board reference contracts without introducing a file-level Canvas kind discriminator.
- [x] 1.4 Add narrative production binding contracts for storyboard scene/shot refs, Canvas node refs, Cut clip refs, generated asset refs, and media refs.
- [x] 1.5 Export new contracts through the appropriate `@neko/shared` public barrels while preserving Layer 0 dependency boundaries.

## 2. Agent Storyboard Overlay Presentation

- [x] 2.1 Extend Agent composite/domain presenters to detect `domainKind: "AnimationPlan"` and normalize it into storyboard plan overlay data.
- [x] 2.2 Merge compatible plan overlays into the StoryboardTable rich renderer by `shotId`, showing animation fields as row-level overlay details rather than a duplicate table.
- [x] 2.3 Render plan-only payloads as compact summaries with source-storyboard-missing diagnostics.
- [x] 2.4 Keep async task status derived from Agent task/execution summary data rather than persisted in StoryboardTable or plan overlay payloads.
- [x] 2.5 Update media-to-video and storyboard-to-animation-plan skill instructions to ask for overlay semantics and stable shot IDs.

## 3. Canvas Scope And Navigation

- [x] 3.1 Persist optional Canvas creative scope metadata through Canvas load/save/migration while preserving unknown optional fields.
- [x] 3.2 Update storyboard import naming/scope behavior so multi-scene imports can create sequence/episode scoped boards and single-scene imports remain scene scoped.
- [x] 3.3 Add related-board summaries to Canvas active context and storyboard execution summaries without leaking raw Webview state or runtime URLs.
- [x] 3.4 Add creator-facing Canvas navigation affordances for scoped boards and unresolved related-board diagnostics.
- [x] 3.5 Ensure Dashboard or project overview can consume compact Canvas board metadata for future episode/sequence grouping.

## 4. Canvas Narrative Production Bindings

- [x] 4.1 Extend narrative scene metadata/snapshot extraction to include production bindings while preserving existing Fountain `sceneRef`.
- [x] 4.2 Add typed Canvas operations for Agent or host code to add/update narrative production bindings after storyboard generation, video generation, or Cut assembly.
- [x] 4.3 Update Narrative Preview resolution so interactive-film/hybrid scenes can consume bound generated video or clip refs through content access resolvers.
- [x] 4.4 Update export packaging to resolve production-bound media with package/final-export intent and reject runtime-only URLs.
- [x] 4.5 Add diagnostics for missing target narrative nodes and non-durable production bindings.

## 5. Validation And Tests

- [x] 5.1 Add shared contract tests for plan overlay validation, provider-neutral prompt intent preservation, and durable ref rejection.
- [x] 5.2 Add Agent Webview presenter/renderer tests for merged storyboard + AnimationPlan overlay rendering and orphan overlay diagnostics.
- [x] 5.3 Add Canvas contract/store tests for creative scope preservation, related-board refs, and import scope behavior.
- [x] 5.4 Add narrative snapshot/preview/export tests for production bindings and graph SSOT preservation.
- [x] 5.5 Run focused validation commands for touched packages and record any residual risk.

## 6. Documentation And Review

- [x] 6.1 Update architecture docs for StoryboardTable versus plan overlay versus Agent async task boundaries.
- [x] 6.2 Update Canvas long-form scope/navigation documentation with episode, sequence, scene, and shot-cluster guidance.
- [x] 6.3 Update Canvas interactive narrative documentation to describe production bindings to storyboard/video artifacts.
- [x] 6.4 Run the Neko quality review checklist for the non-trivial multi-module change and capture validation commands plus remaining risks.
