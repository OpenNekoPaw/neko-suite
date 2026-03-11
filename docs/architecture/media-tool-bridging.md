# Media Tool Bridging Gap Analysis

## Status: NOT IMPLEMENTED

The media generation tools (GenerateImage, GenerateVideo, etc.) defined in `ai-generate.ts` are **schema-only** and cannot be invoked by the LLM. Three layers of disconnection prevent end-to-end execution.

## Architecture Overview

```
Current (broken):

  Skill (ai-generate.ts)          ToolRegistry           MediaGenerationService
  ┌──────────────────┐          ┌──────────────┐        ┌─────────────────────┐
  │ SkillToolDefinition │  ✗     │ Tool (execute) │  ✗    │ generateImage()     │
  │ - name             │──┼────▶│ - not registered│──┼──▶│ generateVideo()     │
  │ - description      │        │                │       │ generateAudio()     │
  │ - parameters       │        └──────────────┘        └─────────────────────┘
  └──────────────────┘
       schema-only            no Tool object           no mapping code

Target (working):

  Skill injects tools     ToolRegistry executes     MediaGenerationService
  ┌──────────────────┐   ┌──────────────────┐     ┌─────────────────────┐
  │ SkillToolDefinition │──▶│ Tool               │──▶│ generateImage()     │
  │ + injected to LLM  │   │ - execute(args)    │   │ generateVideo()     │
  │                    │   │ - maps to service  │   │ generateAudio()     │
  └──────────────────┘   └──────────────────┘     └─────────────────────┘
```

## Layer A: SkillInjection Does Not Include toolDefinitions

**Location**: `packages/neko-agent/packages/agent/src/skill/skill-injector.ts`

`injectSkill()` returns `{ systemPrompt, allowedTools, name, model }` — the `toolDefinitions` field from `SkillToolDefinition[]` is **not included** in the injection result.

`applySkillInjection()` in `agent-session.ts` only:
1. Appends `systemPrompt` to `_history[0].content`
2. Adds `allowedTools` to permissions

It does **not** pass `toolDefinitions` to the LLM's `tools` parameter. The LLM never sees GenerateImage, GenerateVideo, etc. as callable tools.

**Fix**: `SkillInjection` interface should include `toolDefinitions`. `applySkillInjection()` should convert them (via `skillToolToOpenAI()`) and merge into the tools list sent to the LLM.

## Layer B: No Tool Execute Implementation in ToolRegistry

**Location**: `packages/neko-agent/packages/agent/src/skill/builtins/ai-generate.ts`

The 8 media tools are `SkillToolDefinition` objects — they define `name`, `description`, and `parameters` (JSON Schema), but have **no `execute()` method**.

The `ToolRegistry` requires `Tool` objects with an `execute(args): Promise<ToolResult>` method. No `Tool` is registered for GenerateImage, etc.

**Defined tools** (schema-only):
| Tool Name | Maps To |
|-----------|---------|
| GenerateImage | `MediaGenerationService.generateImage()` |
| GenerateVideo | `MediaGenerationService.generateVideo()` |
| GenerateTTS | `MediaGenerationService.generateAudio()` (TTS) |
| GenerateMusic | `MediaGenerationService.generateAudio()` (music) |
| GenerateCharacter | `MediaGenerationService.generateImage()` (character) |
| TransferStyle | `MediaGenerationService.generateImage()` (style transfer) |
| EnhanceVideo | `MediaGenerationService.generateVideo()` (enhance) |
| OptimizeAudio | `MediaGenerationService.generateAudio()` (optimize) |

**Fix**: Create `Tool` wrappers for each `SkillToolDefinition` that delegate to `MediaGenerationService`.

## Layer C: No Args → Service Mapping

**Location**: Gap between `ai-generate.ts` parameters and `MediaGenerationService` API.

Even if tools were registered, there's no code that:
1. Takes the tool call args (e.g., `{ prompt, width, height, style }`)
2. Maps them to `MediaGenerationService.generateImage({ prompt, options: { width, height } })`
3. Handles provider/model selection (currently hardcoded in routing)

**Fix**: Implement mapping functions. Consider adding `providerId` and `modelId` optional parameters to each tool definition so the LLM (or user) can explicitly select which provider/model to use.

## Media Provider Configuration

Media providers are configured in `config.json` alongside chat providers:

```json
{
  "providers": [
    {
      "id": "my-runway",
      "type": "runway",
      "apiUrl": "https://api.dev.runwayml.com/v1",
      "apiKey": "sk-xxx",
      "enabled": true
    }
  ],
  "models": [
    {
      "id": "gen3-alpha",
      "name": "Runway Gen-3 Alpha",
      "providerId": "my-runway",
      "capabilities": ["text_to_video"],
      "enabled": true
    }
  ]
}
```

**Routing**: `MediaRoutingManager.selectProvider()` matches by `ModelCapability` (e.g., `text_to_image`). Supports explicit `providerId + modelId` override (score 100) or auto-routing via capability matching on enabled providers/models.

**Adapter registry**: `MediaAdapterRegistry` maps `ProviderType` → adapter implementation. 8 adapters available: openai, runway, luma, minimax, liblib, suno, vidu, midjourney.

## Key Files

| File | Role |
|------|------|
| `packages/neko-agent/packages/agent/src/skill/builtins/ai-generate.ts` | Schema-only tool definitions |
| `packages/neko-agent/packages/agent/src/skill/skill-injector.ts` | Skill injection (missing toolDefinitions) |
| `packages/neko-agent/packages/agent/src/session/agent-session.ts` | Session management (doesn't inject tools) |
| `packages/neko-agent/packages/platform/src/media/routing/media-routing-manager.ts` | Provider routing by capability |
| `packages/neko-agent/packages/platform/src/media/adapters/` | Provider-specific API adapters |
| `packages/neko-agent/packages/platform/src/media/media-generation-service.ts` | Unified generation API |

## Recommended Fix Order

1. **Layer A**: Add `toolDefinitions` to `SkillInjection` interface; inject into LLM tools
2. **Layer B**: Create `Tool` wrappers with `execute()` for each media tool
3. **Layer C**: Implement args mapping to `MediaGenerationService` methods
4. **Config**: Add optional `providerId`/`modelId` params to tool definitions for explicit routing
5. **Config**: Consider `defaultMediaProvider`/`defaultMediaModel` fields in `UnifiedConfig`
