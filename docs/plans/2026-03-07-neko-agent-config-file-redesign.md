# Neko Agent: Config File API Key Detection & TaskDefaults Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect API keys from `.neko/config.json` files on startup, open the config file for custom key setup instead of a webview form, and add `taskDefaults` for explicit task-type → model binding.

**Architecture:**
- `ConfigBridge` reads `~/.neko/config.json` and workspace `.neko/config.json` at startup, importing any providers with API keys into the platform's globalState via `cm.setProviderApiKey()`.
- A file watcher re-imports whenever the config files change, auto-dismissing onboarding when keys appear.
- `OnboardingFlow`'s custom-key path is replaced with a single "Open config file" button that opens `~/.neko/config.json` in the VS Code editor.
- `TaskDefaults` is a new config field that maps task types (`chat`, `vision`, `videoGeneration`, `audioGeneration`, `imageGeneration`) to explicit model IDs — no auto-routing needed.

**Tech Stack:** TypeScript, VSCode Extension API (`vscode.workspace.openTextDocument`, `vscode.window.showTextDocument`), `fs.watch` via existing `watchConfigFile()` from `@neko/shared/config/config-reader`, React 18, Tailwind CSS.

**Existing infrastructure (DO NOT recreate):**
- `readUserConfig()` / `readWorkspaceConfig(workDir)` — sync, in `@neko/shared/config/config-reader`
- `writeUserConfig(config)` — sync, creates `~/.neko` dir if needed
- `watchUserConfig(callback)` / `watchWorkspaceConfig(workDir, callback)` — return `() => void` cleanup
- `getUserConfigPath()` — returns `~/.neko/config.json`
- `cm.setProviderApiKey(providerId, apiKey)` — on `ConfigManager`
- `cm.getProvider(id)` — checks if provider exists (builtin or custom)

**Build/test commands:**
```bash
# Typecheck neko-types (after Task 1)
cd packages/neko-types && npx tsc --noEmit

# Typecheck platform (after Task 2)
cd packages/neko-agent/packages/platform && npx tsc --noEmit

# Typecheck extension (after Tasks 3-4)
cd packages/neko-agent/packages/extension && npx tsc --noEmit

# Typecheck webview (after Task 5)
cd packages/neko-agent/packages/webview && npx tsc --noEmit

# Run neko-types unit tests
cd packages/neko-types && npx vitest run

# Run webview unit tests
cd packages/neko-agent/packages/webview && npx vitest run
```

---

## Task 1: Add `TaskDefaults` type to `@neko/shared`

**Files:**
- Modify: `packages/neko-types/src/types/config.ts`
- Modify: `packages/neko-types/src/config/types.ts`
- Modify: `packages/neko-types/src/config/index.ts`

**Context:** `ConfigState` lives in `neko-types/src/types/config.ts`. `UnifiedConfig` lives in `neko-types/src/config/types.ts` and already imports from `'../types/config'` — so we can add `TaskDefaults` there and import it back to avoid circular deps.

**Step 1: Add `TaskDefaults` interface to `neko-types/src/types/config.ts`**

Find the `ConfigState` interface (around line 358-368). Add `TaskDefaults` just before it:

```typescript
/**
 * Task-type to model mapping for explicit routing
 */
export interface TaskDefaults {
  /** Model ID for text chat tasks */
  chat?: { modelId: string };
  /** Model ID for vision/multimodal tasks */
  vision?: { modelId: string };
  /** Model ID for video generation tasks */
  videoGeneration?: { modelId: string };
  /** Model ID for audio generation tasks */
  audioGeneration?: { modelId: string };
  /** Model ID for image generation tasks */
  imageGeneration?: { modelId: string };
}

export interface ConfigState {
  providers: ProviderConfig[];
  models: ModelConfig[];
  mcpServers: MCPServerConfig[];
  workflows: WorkflowConfig[];
  prompts: PromptPresetConfig[];
  skills?: import('./skill').ConfiguredSkill[];
  commands?: import('./skill').ConfiguredSlashCommand[];
  /** Task-type to model defaults */
  taskDefaults?: TaskDefaults;
}
```

**Step 2: Add `taskDefaults` to `UnifiedConfig` in `neko-types/src/config/types.ts`**

The file already imports from `'../types/config'`. Add `TaskDefaults` to the existing import:

```typescript
import type {
  ProviderConfig,
  ModelConfig,
  MCPServerConfig,
  WorkflowConfig,
  PromptPresetConfig,
  TaskDefaults,  // ADD THIS
} from '../types/config';
```

Then add to the `UnifiedConfig` interface (after `templateOverrides`):

```typescript
  /** Task-type to model defaults */
  taskDefaults?: TaskDefaults;
```

**Step 3: Export `TaskDefaults` from `neko-types/src/config/index.ts`**

Add to the existing type export block (near `UnifiedConfig`, `GroupConfig`):

```typescript
export type {
  UnifiedConfig,
  NormalizedConfig,
  GroupConfig,
  TemplatePresetConfig,
  TaskDefaults,  // ADD THIS
} from './types';
```

**Step 4: Run typecheck**

```bash
cd packages/neko-types && npx tsc --noEmit
```

Expected: no new errors.

**Step 5: Commit**

```bash
git add packages/neko-types/src/types/config.ts \
        packages/neko-types/src/config/types.ts \
        packages/neko-types/src/config/index.ts
git commit -m "feat(neko-types): add TaskDefaults type for task-type model binding"
```

---

## Task 2: Propagate `taskDefaults` through `UserConfig` and `ConfigManager`

**Files:**
- Modify: `packages/neko-agent/packages/platform/src/config/user-config.ts`
- Modify: `packages/neko-agent/packages/platform/src/config/config-manager.ts`

**Context:**
- `UserConfig` (line 26) is the globalState-based storage format for the VSCode extension.
- `DEFAULT_USER_CONFIG` (line 63) is the fallback when no data is in storage.
- `unifiedToUserConfig()` and `userToUnifiedConfig()` convert between `UnifiedConfig` (file format) and `UserConfig` (globalState format).
- `ConfigManager.getUserConfig()` (line 146) loads user config from `userConfigManager`.
- The file already imports `TaskDefaults` via `UnifiedConfig` from `@neko/shared` — you just need to add it explicitly.

**Step 1: Update imports in `user-config.ts`**

The file imports `type { UnifiedConfig }` from `@neko/shared`. Add `TaskDefaults`:

```typescript
import type { UnifiedConfig, TaskDefaults } from '@neko/shared';
```

**Step 2: Add `taskDefaults` to `UserConfig` interface (line 26)**

```typescript
export interface UserConfig {
  providers: Provider[];
  models: Model[];
  groups: Group[];
  mcpServers: MCPServerPreset[];
  workflows: WorkflowPreset[];
  prompts: PromptPreset[];
  providerOverrides: Record<string, Partial<Provider>>;
  modelOverrides: Record<string, Partial<Model>>;
  groupOverrides: Record<string, Partial<Group>>;
  mcpServerOverrides: Record<string, Partial<MCPServerPreset>>;
  workflowOverrides: Record<string, Partial<WorkflowPreset>>;
  promptOverrides: Record<string, Partial<PromptPreset>>;
  /** Task-type to model defaults */
  taskDefaults?: TaskDefaults;
}
```

**Step 3: Update `DEFAULT_USER_CONFIG` (line 63)**

```typescript
const DEFAULT_USER_CONFIG: UserConfig = {
  providers: [],
  models: [],
  groups: [],
  mcpServers: [],
  workflows: [],
  prompts: [],
  providerOverrides: {},
  modelOverrides: {},
  groupOverrides: {},
  mcpServerOverrides: {},
  workflowOverrides: {},
  promptOverrides: {},
  taskDefaults: undefined,
};
```

**Step 4: Update `unifiedToUserConfig()` (line 85)**

Add `taskDefaults` to the returned object:

```typescript
return {
  providers: (unified.providers as Provider[]) ?? [],
  models: (unified.models as Model[]) ?? [],
  groups: (unified.groups as Group[]) ?? [],
  mcpServers: (unified.mcpServers as MCPServerPreset[]) ?? [],
  workflows: (unified.workflows as WorkflowPreset[]) ?? [],
  prompts: (unified.prompts as PromptPreset[]) ?? [],
  providerOverrides: (unified.providerOverrides as Record<string, Partial<Provider>>) ?? {},
  modelOverrides: (unified.modelOverrides as Record<string, Partial<Model>>) ?? {},
  groupOverrides: (unified.groupOverrides as Record<string, Partial<Group>>) ?? {},
  mcpServerOverrides: (unified.mcpServerOverrides as Record<string, Partial<MCPServerPreset>>) ?? {},
  workflowOverrides: (unified.workflowOverrides as Record<string, Partial<WorkflowPreset>>) ?? {},
  promptOverrides: (unified.promptOverrides as Record<string, Partial<PromptPreset>>) ?? {},
  taskDefaults: unified.taskDefaults,  // ADD THIS
};
```

**Step 5: Update `userToUnifiedConfig()` (line 109)**

Add `taskDefaults` to the returned object:

```typescript
return {
  providers: user.providers,
  models: user.models,
  groups: user.groups,
  mcpServers: user.mcpServers,
  workflows: user.workflows,
  prompts: user.prompts,
  providerOverrides: user.providerOverrides,
  modelOverrides: user.modelOverrides,
  groupOverrides: user.groupOverrides,
  mcpServerOverrides: user.mcpServerOverrides,
  workflowOverrides: user.workflowOverrides,
  promptOverrides: user.promptOverrides,
  taskDefaults: user.taskDefaults,  // ADD THIS
};
```

**Step 6: Add `updateTaskDefaults` to `IUserConfigManager` interface (line 133)**

```typescript
export interface IUserConfigManager {
  load(): UserConfig;
  save(config: UserConfig): Promise<void>;
  updateTaskDefaults(defaults: TaskDefaults | undefined): Promise<void>;  // ADD
  updateProviderOverride(...): Promise<void>;
  // ... rest unchanged
}
```

**Step 7: Implement `updateTaskDefaults` in `UserConfigManager` class**

Add after the `save()` method (around line 190):

```typescript
async updateTaskDefaults(defaults: TaskDefaults | undefined): Promise<void> {
  const config = this.load();
  config.taskDefaults = defaults;
  await this.save(config);
}
```

**Step 8: Implement `updateTaskDefaults` in `FileUserConfigManager` class**

Same method, add in the `FileUserConfigManager` class:

```typescript
async updateTaskDefaults(defaults: TaskDefaults | undefined): Promise<void> {
  const config = this.load();
  config.taskDefaults = defaults;
  await this.save(config);
}
```

**Step 9: Update `ConfigManager.getUserConfig()` fallback (line 146)**

The fallback object when `userConfigManager` is null needs `taskDefaults`:

```typescript
getUserConfig(): UserConfig {
  return this.userConfigManager?.load() ?? {
    providers: [],
    models: [],
    groups: [],
    mcpServers: [],
    workflows: [],
    prompts: [],
    providerOverrides: {},
    modelOverrides: {},
    groupOverrides: {},
    mcpServerOverrides: {},
    workflowOverrides: {},
    promptOverrides: {},
    taskDefaults: undefined,
  };
}
```

**Step 10: Add `saveUserConfig()` to `ConfigManager`**

Add after `getUserConfig()` (around line 162):

```typescript
/**
 * Save user configuration (for taskDefaults and other direct user config updates)
 */
async saveUserConfig(config: UserConfig): Promise<void> {
  await this.userConfigManager?.save(config);
}
```

**Step 11: Typecheck**

```bash
cd packages/neko-agent/packages/platform && npx tsc --noEmit
```

Expected: no new errors.

**Step 12: Commit**

```bash
git add packages/neko-agent/packages/platform/src/config/user-config.ts \
        packages/neko-agent/packages/platform/src/config/config-manager.ts
git commit -m "feat(platform): add taskDefaults to UserConfig and ConfigManager"
```

---

## Task 3: ConfigBridge — import providers from config files on startup + file watcher

**Files:**
- Modify: `packages/neko-agent/packages/extension/src/services/configBridge.ts`

**Context:**
- `ConfigBridge` is initialized in `chatProvider.ts` line 186 via `new ConfigBridge(platform, connectionStateManager, context)`.
- The extension context (`this._context`) has `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` for workspace path.
- We need to read `~/.neko/config.json` and workspace `.neko/config.json` on startup and whenever they change.
- For each provider with `apiKey` in the file config: if `cm.getProvider(id)` returns a provider (builtin exists), call `cm.setProviderApiKey(id, apiKey)`. Otherwise call `cm.setProvider(provider)` to add custom.
- The watcher cleanup functions (`() => void`) must be called in `dispose()`.

**Step 1: Add imports at the top of `configBridge.ts`**

Add after the existing imports (around line 31):

```typescript
import {
  readUserConfig,
  readWorkspaceConfig,
  watchUserConfig,
  watchWorkspaceConfig,
  getUserConfigPath,
  writeUserConfig,
} from '@neko/shared/config/config-reader';
import type { UnifiedConfig, TaskDefaults } from '@neko/shared';
import type { Provider } from '@neko/platform';
```

**Note:** Check what `@neko/platform` exports for `Provider`. If not exported there, import from the platform package's internal path: look for `import type { Provider } from '../types/provider'` — but since configBridge.ts is in the extension package, it can't access platform's internal types directly. Use `ProviderConfig` from `@neko/shared` instead, which is compatible (cast as needed). Actually, `cm.setProviderApiKey(id, apiKey)` only needs string args, so no Provider type is needed for that path. For `cm.setProvider()`, use `provider as Parameters<typeof cm.setProvider>[0]`.

**Step 2: Add new private fields to `ConfigBridge` class**

Add after the existing private field declarations (around line 94):

```typescript
// Config file watcher cleanup functions
private configFileWatcherCleanups: Array<() => void> = [];
```

**Step 3: Add `initConfigFileImport()` private method**

Add before the `dispose()` method:

```typescript
/**
 * Read provider API keys from ~/.neko/config.json and workspace .neko/config.json.
 * Imports into platform ConfigManager so the webview sees them immediately.
 */
private async initConfigFileImport(): Promise<void> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Collect configs: workspace overrides user
  const configs: Array<UnifiedConfig> = [];
  const userConfig = readUserConfig();
  if (userConfig) configs.push(userConfig);
  const wsConfig = workspacePath ? readWorkspaceConfig(workspacePath) : null;
  if (wsConfig) configs.push(wsConfig);

  await this.importProvidersFromConfigs(configs);
}

/**
 * Import providers with API keys from config file data into the platform.
 */
private async importProvidersFromConfigs(configs: Array<UnifiedConfig>): Promise<void> {
  const cm = this.platform.config;

  // Build merged set: later entries override earlier (workspace > user)
  const keyMap = new Map<string, { apiKey: string; provider: UnifiedConfig['providers'] extends Array<infer T> ? T : never }>();

  for (const config of configs) {
    for (const provider of config.providers ?? []) {
      if (provider.apiKey) {
        keyMap.set(provider.id, { apiKey: provider.apiKey, provider });
      }
    }
  }

  for (const [id, { apiKey, provider }] of keyMap) {
    try {
      if (cm.getProvider(id)) {
        // Builtin provider: just set the API key
        await cm.setProviderApiKey(id, apiKey);
      } else {
        // Custom provider: add it fully
        await cm.setProvider(provider as Parameters<typeof cm.setProvider>[0]);
      }
    } catch (error) {
      logger.error(`Failed to import provider ${id} from config file:`, error);
    }
  }

  // Import taskDefaults if present in any config
  const lastConfig = configs.at(-1);
  if (lastConfig?.taskDefaults) {
    const userCfg = cm.getUserConfig();
    userCfg.taskDefaults = lastConfig.taskDefaults as TaskDefaults;
    await cm.saveUserConfig(userCfg);
  }
}
```

**Note:** The type expression for `provider` above is complex. Simplify it by extracting the UnifiedConfig provider type:

```typescript
private async importProvidersFromConfigs(configs: Array<UnifiedConfig>): Promise<void> {
  const cm = this.platform.config;

  // workspace config overrides user config: process user first, then workspace
  const keyMap = new Map<string, { apiKey: string; raw: Record<string, unknown> }>();
  for (const config of configs) {
    for (const provider of config.providers ?? []) {
      if (provider.apiKey) {
        keyMap.set(provider.id, { apiKey: provider.apiKey, raw: provider as unknown as Record<string, unknown> });
      }
    }
  }

  for (const [id, { apiKey, raw }] of keyMap) {
    try {
      if (cm.getProvider(id)) {
        await cm.setProviderApiKey(id, apiKey);
      } else {
        await cm.setProvider(raw as Parameters<typeof cm.setProvider>[0]);
      }
    } catch (error) {
      logger.error(`Failed to import provider ${id} from config file:`, error);
    }
  }

  const lastConfig = configs.at(-1);
  if (lastConfig?.taskDefaults) {
    const userCfg = cm.getUserConfig();
    userCfg.taskDefaults = lastConfig.taskDefaults as TaskDefaults;
    await cm.saveUserConfig(userCfg);
  }
}
```

**Step 4: Add `watchConfigFiles()` private method**

```typescript
/**
 * Watch ~/.neko/config.json and workspace .neko/config.json for changes.
 * Re-imports providers and broadcasts updated config to all webviews.
 */
private watchConfigFiles(): void {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const handleChange = (_config: UnifiedConfig | null) => {
    // Re-read both configs and re-import (async, fire-and-forget)
    void this.initConfigFileImport().then(() => {
      // Broadcast config change so webviews refresh
      for (const postMessage of this.activeWebviews) {
        try {
          postMessage({ type: 'configChanged', source: 'configFile' });
        } catch (error) {
          logger.error('Failed to broadcast config file change:', error);
        }
      }
    });
  };

  const userWatcherCleanup = watchUserConfig(handleChange);
  this.configFileWatcherCleanups.push(userWatcherCleanup);

  if (workspacePath) {
    const wsWatcherCleanup = watchWorkspaceConfig(workspacePath, handleChange);
    this.configFileWatcherCleanups.push(wsWatcherCleanup);
  }
}
```

**Step 5: Call both methods at the end of the constructor**

After the existing initialization calls (`initPromptFileSync`, `initSkillFileSync`, `initHookFileSync`):

```typescript
// Initialize config file import and watching
void this.initConfigFileImport();
this.watchConfigFiles();
```

**Step 6: Update `dispose()` to clean up watchers**

```typescript
dispose(): void {
  for (const disposable of this.disposables) {
    disposable.dispose();
  }
  this.disposables = [];
  this.activeWebviews.clear();
  // Clean up config file watchers
  for (const cleanup of this.configFileWatcherCleanups) {
    cleanup();
  }
  this.configFileWatcherCleanups = [];
}
```

**Step 7: Typecheck**

```bash
cd packages/neko-agent/packages/extension && npx tsc --noEmit
```

Fix any type errors (e.g., Provider cast, UnifiedConfig import paths).

**Step 8: Commit**

```bash
git add packages/neko-agent/packages/extension/src/services/configBridge.ts
git commit -m "feat(extension): import provider API keys from .neko/config.json on startup"
```

---

## Task 4: ConfigBridge — expose `taskDefaults` in configState + new message handlers

**Files:**
- Modify: `packages/neko-agent/packages/extension/src/services/configBridge.ts`

**Context:**
- `buildConfigState()` (line 322) builds the configState sent to webviews.
- `handleMessage()` (line 175) dispatches incoming messages from webviews.
- Need to add: `taskDefaults` to configState, `updateTaskDefaults` handler, `openUserConfigFile` handler.
- `openUserConfigFile`: creates `~/.neko/config.json` if not exists (with template), then opens it in VSCode editor.

**Step 1: Update `buildConfigState()` to include `taskDefaults`**

```typescript
private buildConfigState(): ConfigState {
  const cm = this.platform.config;

  return {
    providers: cm.getProviders(),
    models: cm.getModels(),
    mcpServers: cm.getMCPServers(),
    workflows: [],
    prompts: cm.getPrompts(),
    skills: this.cachedSkills,
    commands: this.cachedCommands,
    taskDefaults: cm.getUserConfig().taskDefaults,  // ADD THIS
  };
}
```

**Step 2: Add `updateTaskDefaults` case to `handleMessage()`**

Add before `default:` (around line 306):

```typescript
case 'updateTaskDefaults': {
  const userCfg = cm.getUserConfig();
  userCfg.taskDefaults = message.taskDefaults as TaskDefaults | undefined;
  await cm.saveUserConfig(userCfg);
  this.notifyChange(postMessage, 'all', 'taskDefaults');
  return true;
}
```

**Step 3: Add `openUserConfigFile` case to `handleMessage()`**

```typescript
case 'openUserConfigFile': {
  await this.handleOpenUserConfigFile();
  return true;
}
```

**Step 4: Add `handleOpenUserConfigFile()` private method**

Add before `dispose()`:

```typescript
/**
 * Open ~/.neko/config.json in the VS Code editor.
 * Creates the file with a template if it doesn't exist.
 */
private async handleOpenUserConfigFile(): Promise<void> {
  const configPath = getUserConfigPath();
  const fs = await import('fs');

  // Create template if file doesn't exist
  if (!fs.existsSync(configPath)) {
    const template: UnifiedConfig = {
      providers: [
        {
          id: 'anthropic',
          name: 'anthropic',
          displayName: 'Anthropic',
          type: 'anthropic',
          apiUrl: 'https://api.anthropic.com',
          apiKey: 'YOUR_ANTHROPIC_API_KEY',
          enabled: true,
        },
      ],
    };
    writeUserConfig(template);
  }

  // Open in editor
  const doc = await vscode.workspace.openTextDocument(configPath);
  await vscode.window.showTextDocument(doc, { preview: false });
}
```

**Note:** The `type` field in the template provider must match `ProviderType`. Since we're writing JSON, the cast is safe. The webview's `isAiConfigured` will auto-update when the user saves valid keys (via the file watcher in Task 3).

**Step 5: Typecheck**

```bash
cd packages/neko-agent/packages/extension && npx tsc --noEmit
```

Expected: no new errors.

**Step 6: Commit**

```bash
git add packages/neko-agent/packages/extension/src/services/configBridge.ts
git commit -m "feat(extension): add taskDefaults to configState and openUserConfigFile handler"
```

---

## Task 5: Webview — OnboardingFlow overhaul + auto-dismiss + i18n updates

**Files:**
- Modify: `packages/neko-agent/packages/webview/src/components/OnboardingFlow/index.tsx`
- Modify: `packages/neko-agent/packages/webview/src/components/index.tsx`
- Modify: `packages/neko-agent/packages/webview/src/i18n/locales/en/onboarding.ts`
- Modify: `packages/neko-agent/packages/webview/src/i18n/locales/zh-cn/onboarding.ts`

**Context:**
- `OnboardingFlow` currently has 3 steps: `'choose'`, `'selectProvider'`, `'enterKey'`.
- We replace `'selectProvider'` and `'enterKey'` with a single `'fileOpened'` step.
- When user clicks "Use my own API key", we send `openUserConfigFile` to the extension and show a hint.
- `index.tsx` line 138 computes `isAiConfigured` and line 140 shows onboarding when false. Add effect to auto-dismiss when true.
- Remove unused i18n keys and add new ones.

### Sub-task 5a: Update i18n keys

**Step 1: Update `packages/neko-agent/packages/webview/src/i18n/locales/en/onboarding.ts`**

Replace the entire file with:

```typescript
import type { MessageBundle } from '@neko/shared';

export const onboarding = {
  'onboarding.title': 'Get Started with AI',
  'onboarding.subtitle': 'Connect an AI service to start chatting.',
  'onboarding.ssoButton': 'Sign in with Neko Studio',
  'onboarding.or': 'or',
  'onboarding.openConfigButton': 'Use my own API key',
  'onboarding.back': 'Back',
  // File-opened step
  'onboarding.fileOpenedTitle': 'Config file opened',
  'onboarding.fileOpenedHint': 'Edit your API key in the config file and save — the panel will update automatically.',
  'onboarding.gotIt': 'Got it',
} as const satisfies MessageBundle;
```

**Step 2: Update `packages/neko-agent/packages/webview/src/i18n/locales/zh-cn/onboarding.ts`**

```typescript
import type { MessageBundle } from '@neko/shared';

export const onboarding = {
  'onboarding.title': '开始使用 AI',
  'onboarding.subtitle': '连接 AI 服务以开始对话。',
  'onboarding.ssoButton': '使用 Neko Studio 账号登录',
  'onboarding.or': '或',
  'onboarding.openConfigButton': '使用自己的 API Key',
  'onboarding.back': '返回',
  // File-opened step
  'onboarding.fileOpenedTitle': '配置文件已打开',
  'onboarding.fileOpenedHint': '在配置文件中填写 API Key 并保存 — 面板将自动更新。',
  'onboarding.gotIt': '知道了',
} as const satisfies MessageBundle;
```

### Sub-task 5b: Rewrite `OnboardingFlow/index.tsx`

**Step 3: Rewrite `packages/neko-agent/packages/webview/src/components/OnboardingFlow/index.tsx`**

The new flow has only two steps: `'choose'` and `'fileOpened'`. Remove all provider-selection and key-entry logic.

```typescript
/**
 * OnboardingFlow — full-screen overlay for first-time AI service setup.
 *
 * Path A: SSO login (opens OAuth in browser)
 * Path B: Open config file (opens ~/.neko/config.json in VS Code editor)
 *
 * Closes automatically when isAiConfigured becomes true (file watcher in extension).
 */
import { useState } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import { postMessage } from '@/components/hooks/useVSCode';

type Step = 'choose' | 'fileOpened';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('choose');

  const handleSsoLogin = () => {
    postMessage({ type: 'ssoLogin' });
    // Flow closes when extension sends back 'ssoSessionChanged' with a session
  };

  const handleOpenConfigFile = () => {
    postMessage({ type: 'openUserConfigFile' });
    setStep('fileOpened');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--vscode-editor-background)]/90 backdrop-blur-sm">
      <div className="w-80 bg-[var(--vscode-panel-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-xl p-6">

        {/* Step: choose */}
        {step === 'choose' && (
          <>
            <h2 className="text-[13px] font-semibold mb-1">{t('onboarding.title')}</h2>
            <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-5">
              {t('onboarding.subtitle')}
            </p>
            <button
              onClick={handleSsoLogin}
              className="w-full py-2 mb-3 text-[12px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
            >
              {t('onboarding.ssoButton')}
            </button>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{t('onboarding.or')}</span>
              <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
            </div>
            <button
              onClick={handleOpenConfigFile}
              className="w-full py-2 text-[12px] rounded border border-[var(--vscode-button-border,var(--vscode-panel-border))] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
            >
              {t('onboarding.openConfigButton')}
            </button>
          </>
        )}

        {/* Step: file opened */}
        {step === 'fileOpened' && (
          <>
            <button
              onClick={() => setStep('choose')}
              className="text-[11px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] mb-3 flex items-center gap-1"
            >
              ← {t('onboarding.back')}
            </button>
            <h2 className="text-[13px] font-semibold mb-2">{t('onboarding.fileOpenedTitle')}</h2>
            <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-5">
              {t('onboarding.fileOpenedHint')}
            </p>
            <button
              onClick={onComplete}
              className="w-full py-2 text-[12px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
            >
              {t('onboarding.gotIt')}
            </button>
          </>
        )}

      </div>
    </div>
  );
}
```

**Note:** `OnboardingFlowProps` no longer needs `providerTemplates`. This also means callers must be updated.

### Sub-task 5c: Update `index.tsx` — remove providerTemplates prop and add auto-dismiss

**Step 4: Update the `OnboardingFlow` call in `index.tsx` (line 988-991)**

Remove `providerTemplates={settings.providerTemplates}` (no longer needed):

```tsx
{showOnboarding && (
  <OnboardingFlow
    onComplete={() => setShowOnboarding(false)}
  />
)}
```

**Step 5: Add auto-dismiss effect to `index.tsx`**

After the existing `isAiConfigured` computation (around line 138-142), add a new effect:

```typescript
// Auto-dismiss onboarding when AI service becomes configured (e.g., via file watcher)
useEffect(() => {
  if (isAiConfigured && showOnboarding) {
    setShowOnboarding(false);
  }
}, [isAiConfigured, showOnboarding]);
```

**Step 6: Verify no remaining references to removed i18n keys**

```bash
grep -r "onboarding.selectProvider\|onboarding.enterKey\|onboarding.testing\|onboarding.testAndStart\|onboarding.testFailed\|onboarding.customKeyButton" \
  packages/neko-agent/packages/webview/src/
```

Expected: no matches.

**Step 7: Typecheck**

```bash
cd packages/neko-agent/packages/webview && npx tsc --noEmit
```

Expected: no new errors.

**Step 8: Run webview tests**

```bash
cd packages/neko-agent/packages/webview && npx vitest run
```

Expected: 71+ tests passing. The 2 pre-existing failures in `@neko/shared/vscode` are unrelated — acceptable.

**Step 9: Commit**

```bash
git add packages/neko-agent/packages/webview/src/components/OnboardingFlow/index.tsx \
        packages/neko-agent/packages/webview/src/components/index.tsx \
        packages/neko-agent/packages/webview/src/i18n/locales/en/onboarding.ts \
        packages/neko-agent/packages/webview/src/i18n/locales/zh-cn/onboarding.ts
git commit -m "feat(webview): replace custom key form with open-config-file flow + auto-dismiss"
```

---

## Final Verification

After all 5 tasks:

```bash
# Full typecheck all packages
cd packages/neko-types && npx tsc --noEmit
cd packages/neko-agent/packages/platform && npx tsc --noEmit
cd packages/neko-agent/packages/extension && npx tsc --noEmit
cd packages/neko-agent/packages/webview && npx tsc --noEmit

# Run all tests
cd packages/neko-types && npx vitest run
cd packages/neko-agent/packages/webview && npx vitest run

# Grep for removed keys (should return nothing)
grep -r "selectProvider\|enterKey\|testAndStart\|testFailed\|customKeyButton" \
  packages/neko-agent/packages/webview/src/i18n/
```

---

## Design Notes

### Why no auto-routing?

The existing `LLMRoutingManager` already handles routing via health filter → capability filter → cost optimization → load balancing. Adding `taskDefaults` as explicit bindings is sufficient because:
1. Users who care about which model handles video generation can set `taskDefaults.videoGeneration.modelId`
2. Users who don't care get sensible defaults from the capability filter
3. Adding `ExecutionTaskType`-based routing in `LLMRoutingContext` is a future enhancement — it requires changes to how `AgentRunner` constructs routing contexts

### Config file priority

When `importProvidersFromConfigs()` is called, user config is pushed first, then workspace config. The loop overwrites with later entries, so workspace `.neko/config.json` takes precedence over `~/.neko/config.json`, consistent with the existing three-tier priority.

### Security note (future)

Currently, API keys imported from config files are stored in VSCode `globalState` (plain text). A future improvement is to migrate to `context.secrets` (OS keychain) for API key storage. This is out of scope for this plan.
