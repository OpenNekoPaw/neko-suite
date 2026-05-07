## 1. Shared Contracts and Type Boundaries

- [x] 1.1 Add shared `PerceptionCard`, `PerceptionEvidenceEntry`, `PerceptualAssetRef`, `PerceptionDiagnostics`, and perception policy contracts in `@neko/shared`
- [x] 1.2 Add shared `ToolResultBackfillPayload`, `ToolResultBackfillMergePolicy`, and `ToolResultBackfillDiagnostic` contracts in `@neko/shared`
- [x] 1.3 Extend shared or agent tool result types to carry `attachments`, `perceptionCards`, and `backfillDiagnostics` without using unsafe `any`
- [x] 1.4 Extend `@neko-agent/types` ToolCall/result, Webview protocol, and message parse/build tests for backfilled tool results
- [x] 1.5 Update attachment/path semantics or add compatibility adapters so persisted tool result metadata uses stable asset refs instead of absolute host paths

## 2. ToolResultBackfill Runtime Closure

- [x] 2.1 Implement deterministic backfill merge helpers for shallow `dataPatch`, overwrite allowlist, conflict diagnostics, attachment dedupe, and perception card merge
- [x] 2.2 Add `tool_result_backfill` AgentEvent type and project it to Webview-safe tool result update messages
- [x] 2.3 Add pure `applyToolResultBackfill()` behavior in `agent-stream-state.ts` for `collectedToolCalls` and tool-call content blocks
- [x] 2.4 Add `AgentSession.patchToolResult()` or equivalent session authority API for stream-ended tool result patching
- [x] 2.5 Patch Journal and ConversationRecord projections so next-turn history reads backfilled tool results
- [x] 2.6 Implement `BackfillCoordinator` runtime service to coordinate stream projection, Webview notification, session patch, and history patch
- [x] 2.7 Add unit tests for stream-active backfill, stream-ended persistent patch, unknown tool call diagnostics, conflict diagnostics, attachment dedupe, and perception card replacement

## 3. PerceptionCard Pipeline

- [x] 3.1 Create `neko-agent/packages/agent/src/perception/` contracts for `IPerceptionPipeline`, `PerceptualAssetResolverPort`, `MediaProbePort`, `PerceptionClientPort`, `PerceptualAssetPort`, and `BackfillSink`
- [x] 3.2 Implement `PerceptionPolicyResolver` with default `on-completion`, `on-reference`, and `on-demand` layer selection rules
- [x] 3.3 Implement `PerceptionPipeline` using injected ports for Layer 0 probe, Layer 1 semantic evidence, Layer 2 perceptual asset refs, cost metadata, and cache key preservation
- [x] 3.4 Add confidence/retry handling for perception evidence without collapsing evidence reliability into a card-level confidence score
- [x] 3.5 Implement aggregate `PerceiveTool` with lazy injection registration and focus/depth based orchestration
- [x] 3.6 Add runtime tests for image Layer 0, video/audio metadata, Layer 1 evidence composition, Layer 2 refs, low-confidence diagnostics, and host-independent port usage

## 4. Media Task Integration

- [x] 4.1 Update `mediaTaskDeliveryHost.ts` integration so `finalizeCompletedMediaTaskOutputs()` emits stable `GeneratedAsset` / `PerceptualAssetRef` metadata
- [x] 4.2 Attach `PerceptionPolicyResolver` after media task completion and call `IPerceptionPipeline.perceive()` according to policy
- [x] 4.3 Send completed asset metadata, attachments, and `perceptionCards[]` through `BackfillSink.applyBackfill()`
- [x] 4.4 Keep file reads, workspace path resolution, VSCode URI conversion, webview URI conversion, and base64 conversion inside Extension or host/provider adapters
- [x] 4.5 Add integration tests for generate image task completion through backfill payload, perception card creation, Webview update, and next-turn history visibility

## 5. Provider-Aware Perception Delivery

- [x] 5.1 Add `ProviderInputModalities` contract and resolver with priority: runtime adapter capability, ProviderCard `inputModalities`, built-in defaults, text-only fallback
- [x] 5.2 Add `projectPerceptionCardToContentParts()` in `@neko/ai-sdk` with text summary, image payload, video payload, and audio-as-text fallback behavior
- [x] 5.3 Add `projectMultimodalPacketToChatMessageAsync()` while preserving existing synchronous projection behavior
- [x] 5.4 Implement bounded `assetLoader` interface that resolves `PerceptualAssetRef.uri`, applies `VisionPreprocessPolicy`, and returns provider-ready payload only at projection time
- [x] 5.5 Wire async projection into AI SDK or platform message assembly without adding provider-specific media rules to `act-phase.ts`
- [x] 5.6 Add projection tests for image-capable provider, text-only provider, loader failure fallback, audio realtime-only fallback, and sync compatibility

## 6. CompositeBlock and RichContent Presentation

- [x] 6.1 Extend `ContentBlockType` and message contracts with `CompositeBlockData`, `CompositeSection`, `MediaRef`, and template types
- [x] 6.2 Add Webview presenter assembly that resolves composite `mediaRefs` through backfilled tool results and adapter-provided webview-safe URIs
- [x] 6.3 Add bounded missing-media diagnostic projection for unresolved or not-yet-backfilled media refs
- [x] 6.4 Implement and register `StoryboardTableRenderer`, `ComparisonGridRenderer`, and `AssetGalleryRenderer` through the existing RichContent registry
- [x] 6.5 Add Webview presenter/render tests for storyboard rows, comparison variants, gallery assets, missing media state, and no provider-context leakage

## 7. Architecture Guards, Documentation, and Validation

- [x] 7.1 Add or update boundary tests proving shared contracts do not depend on VSCode/React and runtime perception services do not import Webview or Extension APIs
- [x] 7.2 Add path-policy tests proving persisted PerceptionCard/backfill/session history does not contain `file://`, webview URI, inline base64, or absolute host paths
- [x] 7.3 Update `docs/architecture/adr-agent-multimodal-perception.md` or companion implementation notes with any implementation-time contract adjustments
- [x] 7.4 Run targeted TypeScript checks for `@neko/shared`, `@neko-agent/types`, `@neko/agent`, `@neko/ai-sdk`, Extension, and Webview packages touched by the implementation
- [x] 7.5 Run targeted Vitest suites for backfill merge, stream state, session/history patch, perception pipeline, provider projection, and composite presentation
- [x] 7.6 Run `openspec validate implement-agent-multimodal-perception --strict` and record the result
