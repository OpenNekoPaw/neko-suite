# neko-agent Config File API Key Detection — Design

**Date**: 2026-03-07
**Status**: Approved

## Problem

Users must manually enter API keys through the `OnboardingFlow` webview form every time they set up a new workspace. There is no support for:
1. Storing keys in a version-controllable config file (e.g., `.neko/config.json`)
2. Routing different task types (chat, vision, image generation) to different models explicitly
3. Auto-detecting config file changes without a manual restart

## Solution

Three-part change:

1. **Config file import on startup** — `ConfigBridge` reads `~/.neko/config.json` and workspace `.neko/config.json` at startup. Any providers with `apiKey` fields are imported into `platform.config` automatically.
2. **File watcher** — Watcher re-imports whenever either config file changes, and auto-dismisses the onboarding overlay when keys appear.
3. **Replace OnboardingFlow key-entry form with "Open config file"** — Instead of typing keys into a webview form, the user clicks a button that opens `~/.neko/config.json` directly in the VS Code editor.

## New Config Fields

### `TaskDefaults` (in `@neko/shared`)

```typescript
interface TaskDefaults {
  chat?: { modelId: string };
  vision?: { modelId: string };
  videoGeneration?: { modelId: string };
  audioGeneration?: { modelId: string };
  imageGeneration?: { modelId: string };
}
```

Added to `ConfigState` (runtime state) and `UnifiedConfig` (file format). Propagated through `UserConfig` and `ConfigManager`.

Why no auto-routing? The existing `LLMRoutingManager` (health → capability → cost → load) already handles routing. `TaskDefaults` provides explicit overrides for users who want control; everyone else gets sensible defaults automatically.

## Architecture Changes

### Added

| Location | Addition |
|---|---|
| `@neko/shared/types/config.ts` | `TaskDefaults` interface |
| `@neko/shared/config/types.ts` | `taskDefaults` field on `UnifiedConfig` |
| `platform/config/user-config.ts` | `taskDefaults` on `UserConfig`; `updateTaskDefaults()` on `IUserConfigManager` |
| `platform/config/config-manager.ts` | `saveUserConfig()` method; `taskDefaults` in fallback config |
| `extension/services/configBridge.ts` | `initConfigFileImport()`, `importProvidersFromConfigs()`, `watchConfigFiles()`, `handleOpenUserConfigFile()` |
| `webview/OnboardingFlow/index.tsx` | Rewritten: 2-step flow (`choose` → `fileOpened`) |

### Changed

| Location | Change |
|---|---|
| `configBridge.ts buildConfigState()` | Includes `taskDefaults: cm.getUserConfig().taskDefaults` |
| `configBridge.ts handleMessage()` | New cases: `updateTaskDefaults`, `openUserConfigFile` |
| `webview/index.tsx` | Removes `providerTemplates` prop; adds auto-dismiss effect |
| `i18n/locales/en,zh-cn/onboarding.ts` | Replaces provider/key-entry keys with `openConfigButton`, `fileOpenedTitle`, `fileOpenedHint`, `gotIt` |

### Unchanged

- All existing `ConfigBridge` Provider CRUD operations (`updateProvider`, `validateApiKey`, `listProviderModels`)
- Skills / Hooks filesystem scanning
- MCP runtime configuration (`.neko/settings.json`)
- `LLMRoutingManager` automatic routing logic

## Data Flow

### Startup (config file import)

```
Extension Host                          Webview
────────────────────────────────────────────────────
ConfigBridge constructor
  initConfigFileImport()
    readUserConfig()   → ~/.neko/config.json
    readWorkspaceConfig() → .neko/config.json
    importProvidersFromConfigs()
      cm.setProviderApiKey(id, apiKey)  ← builtin providers
      cm.setProvider(provider)          ← custom providers
  watchConfigFiles()
    watchUserConfig(callback)
    watchWorkspaceConfig(path, callback)
→ buildConfigState() includes populated providers + taskDefaults
→ postMessage('configStateWithStatus')
                                        → isAiConfigured → true
                                        → OnboardingFlow auto-dismissed
```

### Open config file (onboarding Path B)

```
Webview                             Extension Host
────────────────────────────────────────────────────
Click "Use my own API key"
→ postMessage('openUserConfigFile')
                                    handleOpenUserConfigFile()
                                      if file missing → writeUserConfig(template)
                                      openTextDocument(~/.neko/config.json)
                                      showTextDocument(doc)
Webview → step = 'fileOpened'
User edits + saves config file
                                    File watcher fires
                                      initConfigFileImport() re-runs
                                      providers imported → configChanged
→ isAiConfigured = true
→ OnboardingFlow auto-dismissed (useEffect)
```

## Config File Priority

User config (`~/.neko/config.json`) is processed first, then workspace config (`.neko/config.json`). Later entries overwrite earlier, so workspace takes precedence — consistent with the existing three-tier config priority.

## OnboardingFlow: Before vs After

| | Before | After |
|---|---|---|
| Steps | `choose` → `selectProvider` �� `enterKey` | `choose` → `fileOpened` |
| Path B action | Webview form with key input + test button | Opens `~/.neko/config.json` in VS Code editor |
| Auto-dismiss | No | Yes — `useEffect` on `isAiConfigured` |
| i18n keys removed | `selectProvider`, `enterKey`, `testing`, `testAndStart`, `testFailed`, `customKeyButton` | — |
| i18n keys added | — | `openConfigButton`, `fileOpenedTitle`, `fileOpenedHint`, `gotIt` |

## Security Note (Future)

API keys from config files are currently stored in VSCode `globalState` (plain text). A future improvement is to migrate to `context.secrets` (OS keychain). Out of scope for this plan.
