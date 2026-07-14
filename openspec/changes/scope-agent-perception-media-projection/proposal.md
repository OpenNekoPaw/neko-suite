## Why

Agent provider projection currently re-collects historical `PerceptionCard` records and expands their provider-loadable image references on every later model call. A real twelve-image analysis replayed about 15 MB of base64 media on ordinary follow-up turns, contributing to repeated upstream timeouts and violating the intended boundary between scoped media understanding and durable compact evidence.

## What Changes

- Introduce an explicit media-context lifecycle: native media is scoped to the turn that requested it, while durable conversation history retains compact perception evidence and stable resource references.
- Stop automatically expanding historical tool-produced `PerceptionCard` records into image, audio, or video payloads for the main chat model.
- Preserve same-chat-model native multimodal input for the originating turn and preserve the distinct-understanding-model perception path.
- Require explicit reinspection through the canonical read/perception path when the Agent needs media bytes again.
- Add path-level diagnostics and tests proving follow-up turns do not reload historical media while current-turn native media and compact semantic evidence remain available.
- Record focused Agent Evaluation evidence for the multi-turn provider projection path.

## Capabilities

### New Capabilities

- `agent-perception-context-lifecycle`: Defines turn-scoped native media delivery, durable compact perception evidence, explicit media reinspection, and no-replay behavior across Agent turns.

### Modified Capabilities

None.

## Impact

- Affects provider-aware message projection in `@neko/platform`, multimodal projection in `@neko/ai-sdk`, and the Agent session/tool-result path that persists `PerceptionCard` evidence.
- Does not change persisted project formats, user media, `ResourceRef` identity, model configuration, Webview protocol, or the public perception tool schema.
- Existing conversation journals remain readable; historical perception cards continue to provide structural and semantic evidence, but no longer cause implicit binary media reload on unrelated future turns.
- Success means an initial media-analysis turn can use the selected native or perception route, a later text-only turn receives compact evidence without provider media payloads, and explicit reinspection can still reload the selected resource.
