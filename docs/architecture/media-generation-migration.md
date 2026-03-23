# Media Generation Architecture: AI SDK Migration Design

## Context

neko-agent currently uses a self-built media generation stack (`OpenAICompatMediaAdapter` + `MediaTaskExecutor` + `TaskManager`) to handle image/video/audio generation. This approach requires manually maintaining adapter logic for each provider's API differences (endpoint paths, request/response formats, auth, polling).

AI SDK v6 now provides unified APIs for media generation (`generateImage`, `experimental_generateVideo`, `experimental_generateSpeech`) with official provider packages for major platforms. This document designs the migration path from self-built adapters to AI SDK-based architecture.

## Current Architecture (Before)

```
Agent Tool (GenerateImage/Video/Music/TTS)
  ↓
MediaGenerationService
  ↓ selectProvider()
MediaRoutingManager (defaultMediaModels config)
  ↓
MediaTaskExecutor
  ↓ getAdapter()
OpenAICompatMediaAdapter  ← single adapter handles all providers
  ↓ HTTP request
Provider API (OpenAI/NewAPI/Kling/...)
```

**Problems:**
- One adapter tries to handle all providers via config hacks (`protocolVariant.mediaEndpoints`)
- Request/response format differences require per-provider branching (`id` vs `task_id`)
- No support for providers with non-OpenAI-compatible APIs (Google Veo, Seedance)
- Async polling logic reimplemented from scratch

## Target Architecture (After)

```
Agent Tool (GenerateImage/Video/Music/TTS)
  ↓
MediaGenerationService
  ↓ selectProvider()
MediaRoutingManager (defaultMediaModels config + ModelType)
  ↓
AI SDK unified API
  ├─ generateImage()
  ├─ experimental_generateVideo()
  ├─ experimental_generateSpeech()
  └─ generateMusic()  ← custom extension
      ↓
@neko/ai-sdk  (packages/neko-agent/packages/ai-sdk/)
  ├─ resolveProvider()       ← provider factory
  ├─ providers/newapi/       ← custom NewAPI/OneAPI provider
  ├─ generateMusic()         ← custom music generation extension
  ↓
AI SDK Provider packages (external dependencies)
  ├─ @ai-sdk/openai        (Sora, DALL-E, TTS)
  ├─ @ai-sdk/google         (Veo, Imagen)
  ├─ @ai-sdk/klingai        (Kling video)
  ├─ @ai-sdk/bytedance      (Seedance video)
  ├─ @ai-sdk/fal            (Luma, Runway, Wan, etc.)
  ├─ @ai-sdk/replicate      (open-source models)
  └─ @ai-sdk/elevenlabs     (TTS)
```

## Design Decisions

### 1. Extend, Don't Fork

Use AI SDK as-is. Implement custom providers via standard interfaces (`ImageModelV3`, `VideoModelV3`, `SpeechModelV3`) for unsupported platforms.

### 2. Package Structure: `@neko/ai-sdk`

All AI SDK integration code lives in `packages/neko-agent/packages/ai-sdk/`, as a sub-package of neko-agent (same level as `platform`, `agent`, `extension`).

```
packages/neko-agent/packages/ai-sdk/    ← @neko/ai-sdk
├─ src/
│   ├─ index.ts                         ← public API
│   ├─ resolve.ts                       ← resolveProvider() factory
│   ├─ types.ts                         ← shared types (MusicModelV1, etc.)
│   ├─ music.ts                         ← generateMusic() custom extension
│   └─ providers/
│       └─ newapi/                      ← NewAPI/OneAPI custom provider
│           ├─ index.ts                 ← createNewAPI() entry
│           ├─ newapi-image-model.ts    ← ImageModelV3 impl
│           ├─ newapi-video-model.ts    ← VideoModelV3 impl
│           └─ newapi-speech-model.ts   ← SpeechModelV3 impl
├─ package.json                         ← name: "@neko/ai-sdk"
└─ tsconfig.json
```

**Dependency direction:**
```
platform → @neko/ai-sdk → ai (AI SDK core)
                        → @ai-sdk/openai
                        → @ai-sdk/google
                        → @ai-sdk/klingai
                        → @ai-sdk/bytedance
                        → @ai-sdk/fal
                        → ...
```

`platform` layer depends on `@neko/ai-sdk` (replaces current adapter registry). `@neko/ai-sdk` depends on AI SDK core + official provider packages.

### 3. Custom Provider: NewAPI/OneAPI

NewAPI/OneAPI are OpenAI-compatible proxy services with subtle API differences. A dedicated provider inside `@neko/ai-sdk` handles these differences cleanly instead of config hacks.

```typescript
// packages/neko-agent/packages/ai-sdk/src/providers/newapi/index.ts
import type { ImageModelV3, VideoModelV3 } from 'ai';

export function createNewAPI(config: { baseURL: string; apiKey: string }) {
  return {
    image(modelId: string): ImageModelV3 { ... },
    video(modelId: string): VideoModelV3 { ... },
    speech(modelId: string): SpeechModelV3 { ... },
  };
}
```

**Differences handled internally:**
- Video endpoint: `/v1/video/generations` (not `/v1/videos/generations`)
- Response task ID: `task_id` (not `id`)
- Resolution: `width`/`height` (not `resolution` string)
- Image-to-video field: `image` (not `image_url`)

### 4. Music Generation Extension

AI SDK has no music generation API. Two options:

**Option A: Custom `generateMusic()` function** (recommended)
- Mirror AI SDK's pattern (`model` + `prompt` + `providerOptions`)
- Define `MusicModelV1` interface
- Implement providers as needed

**Option B: Reuse `experimental_generateSpeech()` with music models**
- Semantically incorrect (speech ≠ music)
- Would require provider-side hacking

### 5. Provider Resolution

Map `ModelConfig.type` + `ModelConfig.providerId` to AI SDK provider instances:

```typescript
function resolveProvider(model: ModelConfig, provider: ProviderConfig) {
  switch (provider.type) {
    case 'openai':    return createOpenAI({ baseURL: provider.apiUrl, apiKey: provider.apiKey });
    case 'google':    return createGoogleGenerativeAI({ apiKey: provider.apiKey });
    case 'newapi':    return createNewAPI({ baseURL: provider.apiUrl, apiKey: provider.apiKey });
    case 'klingai':   return createKlingAI({ apiKey: provider.apiKey });
    case 'bytedance': return createByteDance({ apiKey: provider.apiKey });
    case 'fal':       return createFal({ apiKey: provider.apiKey });
    // ...
  }
}
```

### 6. Adapter Layer Simplification

Replace `OpenAICompatMediaAdapter` + `BaseMediaAdapter` + adapter registry with a thin wrapper:

```typescript
class AISDKMediaAdapter {
  async generateImage(request, model, provider): Promise<MediaAdapterResult> {
    const sdk = resolveProvider(model, provider);
    const { images } = await generateImage({
      model: sdk.image(model.name),
      prompt: request.prompt,
      size: `${request.width}x${request.height}`,
      n: request.count,
    });
    return { status: 'completed', outputs: images.map(toMediaOutput) };
  }

  async generateVideo(request, model, provider): Promise<MediaAdapterResult> {
    const sdk = resolveProvider(model, provider);
    const { video } = await experimental_generateVideo({
      model: sdk.video(model.name),
      prompt: request.prompt,
      resolution: `${request.width}x${request.height}`,
      duration: request.duration,
      fps: request.fps,
    });
    return { status: 'completed', outputs: [toMediaOutput(video)] };
  }

  // Similar for speech and music
}
```

**Key benefit**: Async polling is handled internally by AI SDK providers — no more `MediaTaskExecutor` polling loop.

### 7. BackgroundMode Task Integration

AI SDK's `generateVideo()` is a blocking call (awaits completion internally). But neko-agent needs `backgroundMode: true` for UI progress tracking.

Solution: Keep `TaskManager` for task lifecycle, but delegate actual generation to AI SDK:

```
TaskManager.submit()
  → TaskExecutor runs in background
    → AI SDK generateVideo() (blocking, with internal polling)
    → TaskManager updates progress via onProgress callback
  → Agent tool returns { backgroundMode: true, taskId } immediately
  → AgentStreamProcessor subscribes to TaskManager progress
```

### 8. ProviderType Extension

Add new provider types to support AI SDK providers:

```typescript
// packages/neko-types/src/types/config.ts
export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'azure'
  | 'ollama'
  | 'generic'
  | 'newapi'
  // New AI SDK providers
  | 'klingai'
  | 'bytedance'
  | 'fal'
  | 'replicate'
  | 'elevenlabs';
```

## Migration Plan

### Phase 1: Foundation (Low Risk)

1. Create `@neko/ai-sdk` package at `packages/neko-agent/packages/ai-sdk/`
2. Add AI SDK v6 dependency (`ai`) + official provider packages
3. Implement NewAPI custom provider in `src/providers/newapi/`
4. Implement `resolveProvider()` factory in `src/resolve.ts`
5. Add new ProviderType values

### Phase 2: Image Generation Migration

1. Replace `OpenAICompatMediaAdapter.generateImage()` with AI SDK `generateImage()`
2. Test with OpenAI (DALL-E) and NewAPI (flux-kontext-pro)
3. Keep old adapter as fallback during transition

### Phase 3: Video Generation Migration

1. Replace `OpenAICompatMediaAdapter.generateVideo()` with AI SDK `experimental_generateVideo()`
2. Implement `NewAPIVideoModel` in custom provider
3. Test with Sora (via OpenAI) and NewAPI
4. Remove `protocolVariant.mediaEndpoints` hack

### Phase 4: Speech Migration

1. Replace GenerateTTS tool executor with AI SDK `experimental_generateSpeech()`
2. Test with OpenAI TTS

### Phase 5: Cleanup

1. Remove `OpenAICompatMediaAdapter` and `BaseMediaAdapter`
2. Remove `MediaAdapterRegistry`
3. Simplify `MediaTaskExecutor` to use AI SDK internally
4. Update documentation

## What Stays

| Component | Keep? | Reason |
|-----------|:-----:|--------|
| `MediaGenerationService` | ✅ | Public API for agent tools |
| `MediaRoutingManager` | ✅ | Model selection by type + defaults |
| `TaskManager` | ✅ | Background task lifecycle + progress |
| `ModelConfig.type` | ✅ | Model classification |
| `defaultMediaModels` | ✅ | Default model per media type |
| GenerateMusic tool | ✅ | AI SDK has no music generation |
| `OpenAICompatMediaAdapter` | ❌ | Replaced by AI SDK providers |
| `BaseMediaAdapter` | ❌ | Replaced by AI SDK interfaces |
| `MediaAdapterRegistry` | ❌ | Replaced by `@neko/ai-sdk` `resolveProvider()` |
| `protocolVariant.mediaEndpoints` | ❌ | Provider differences handled in `@neko/ai-sdk` provider packages |

## Provider Support Matrix (Post-Migration)

| Provider | Image | Video | Speech | Music | Package |
|----------|:-----:|:-----:|:------:|:-----:|---------|
| OpenAI | ✅ DALL-E | ✅ Sora | ✅ TTS | — | `@ai-sdk/openai` |
| Google | ✅ Imagen | ✅ Veo | — | — | `@ai-sdk/google` |
| Kling | — | ✅ | — | — | `@ai-sdk/klingai` |
| Seedance | — | ✅ | — | — | `@ai-sdk/bytedance` |
| fal.ai | ✅ | ✅ | — | — | `@ai-sdk/fal` |
| Replicate | ✅ | ✅ | — | — | `@ai-sdk/replicate` |
| ElevenLabs | — | — | ✅ | — | `@ai-sdk/elevenlabs` |
| NewAPI/OneAPI | ✅ | ✅ | ✅ | ✅ | `@neko/ai-sdk` (built-in provider) |

## Current State (2026-03-23)

### Completed Phases

| Phase | Status | Notes |
|-------|:------:|-------|
| Phase 1: Foundation | ✅ | `@neko/ai-sdk` package created with resolveProvider + NewAPI provider |
| Phase 2: Image Migration | ✅ | `generateImage()` via AI SDK, fallback to legacy adapter |
| Phase 3: Video Migration | ✅ | `experimental_generateVideo()` via AI SDK, fallback to legacy adapter |
| Phase 4: Speech Migration | ✅ | `experimental_generateSpeech()` via AI SDK, including music |
| Phase 5: Legacy Bridge | ✅ | All legacy adapters bridged to AI SDK interface; unified single path |

### Architecture: Unified Single-Path Execution

```
MediaTaskExecutor.createExecutor()
  → legacyAdapter = adapterRegistry.getForType(provider.type)
  → tryAISDK(generationType, request, model, provider, legacyAdapter)
    → resolveProvider(providerType, config, legacyAdapter)
      ├─ openai      → @ai-sdk/openai (native: image + speech)
      ├─ newapi       → NewAPI custom provider (native: image + video + speech)
      ├─ generic      → NewAPI custom provider (same as newapi)
      ├─ others       → LegacyBridge(adapter) wrapping existing adapter
      └─ no adapter   → null → error
    → generateImage() / experimental_generateVideo() / experimental_generateSpeech()
    → return TaskOutput (success) | { error } (failure)
```

### Legacy Adapter Bridge (`@neko/ai-sdk/src/bridge/`)

All 7 legacy adapters (runway, luma, minimax, liblib, suno, vidu, midjourney) are wrapped as AI SDK models via a generic bridge:

| Bridge Class | AI SDK Interface | Wraps |
|-------------|-----------------|-------|
| `LegacyImageModel` | `ImageModelV3` | `adapter.generateImage()` + internal polling |
| `LegacyVideoModel` | `VideoModelV3` | `adapter.generateVideo()` + internal polling |
| `LegacySpeechModel` | `SpeechModelV3` | `adapter.generateAudio()` + internal polling |

Bridge models handle async polling internally (5s interval, 360 max attempts), converting the adapter's submit-poll pattern to AI SDK's blocking `doGenerate()` pattern.

### Error Handling: No Silent Fallback

User-specified provider + model is respected. If the provider fails, the error is reported directly — **no automatic fallback to another provider**. This is intentional:

- Users know which model they're paying for
- Different providers have different pricing and quality
- Transparent errors let users decide whether to switch

```
AI SDK call succeeds → return { data }
AI SDK call fails    → return { error: message }  (NOT silent null)
No provider found    → return { error: "No AI SDK provider..." }
```

### Future: Replacing Legacy Adapters

When an official AI SDK provider package is released (e.g., `@ai-sdk/minimax`):

1. Add a new case in `resolveProvider()` switch
2. The bridge path for that provider type is automatically bypassed
3. Legacy adapter code can be deleted after verification

No changes needed in `MediaTaskExecutor` or any other consumer.

## Chat-Based Image Generation (2026-03-23)

### Background

Traditional image generation uses dedicated endpoints (`/v1/images/generations`). But multimodal LLMs (Gemini, GPT-image) generate images via chat completions (`/v1/chat/completions`) with `modalities: ['text', 'image']`. This is an industry trend — newer models increasingly embed image generation into the chat API.

### Two Image Generation Paths

```
Path 1 (standard): Dedicated image models — flux, dall-e, imagen
  → NewAPIImageModel → POST /v1/images/generations

Path 2 (chat): Multimodal LLMs — gemini-3-pro-image-preview, gpt-image-1.5
  → NewAPIChatImageModel → POST /v1/chat/completions + modalities: ['text', 'image']
```

### Path Selection Logic

Determined by model capabilities in `MediaTaskExecutor.tryAISDK()`:

```
model has 'chat' + 'image_generation' capabilities → imageMode: 'chat'
model has only 'image_generation' capability        → imageMode: 'standard'
```

The `imageMode` is passed through `resolveProvider()` → `createNewAPIProvider()` to select the correct `ImageModelV3` implementation.

### NewAPIChatImageModel

Implements `ImageModelV3` but internally sends a chat completions request:

```typescript
// Request
POST /v1/chat/completions
{
  "model": "gemini-3-pro-image-preview",
  "messages": [{ "role": "user", "content": "Generate a cute cat" }],
  "modalities": ["text", "image"]
}

// Response: content array with image parts (base64)
```

Handles multiple response formats:
- `{ type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }`
- `{ type: 'image', data: 'base64...' }`
- String content with embedded `data:image/...;base64,...` URLs

### No Conflict with Agent Chat Model

Chat LLM and media models are independently configured:
- `defaultModel` → LLM for agent reasoning (e.g., `gpt-5.1-codex`)
- `defaultMediaModels.image` → image generation model (e.g., `gemini-3-pro-image-preview`)

Agent framework filters inline images from LLM responses (`think-phase.ts` line 62: `.filter(part.type === 'text')`), so even if the chat LLM can generate images, it won't bypass the `GenerateImage` tool.

### NewAPI Video: Sora Format

NewAPI video generation now uses the official Sora format:

```
POST /v1/videos (multipart/form-data)
  - model: "sora-2"
  - prompt: "..."
  - seconds: "8" (string, not duration number)
  - input_reference: binary file (for image-to-video)

GET /v1/videos/{video_id} → poll status
GET /v1/videos/{video_id}/content → download video file
```

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI SDK video API is `experimental_` | API may change | Pin AI SDK version, isolate in `@neko/ai-sdk` |
| NewAPI format diverges further | Custom provider breaks | Maintain `@neko/ai-sdk` NewAPI provider independently |
| Bridge adds indirection overhead | Negligible latency | Bridge is thin wrapper, HTTP call dominates |
| Breaking changes in AI SDK v7 | Refactor `@neko/ai-sdk` only | All AI SDK usage isolated in one package |
