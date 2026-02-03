/**
 * VS Code Configuration Storage Adapter
 *
 * Implements UserConfigStorage interface for VS Code environment.
 * Uses VS Code globalState for persistent storage.
 */

import * as vscode from 'vscode';
import type { UserConfigStorage } from '@uniedit/platform';

/**
 * VS Code configuration storage implementation
 * Adapts VS Code's globalState to the platform's UserConfigStorage interface
 */
export class VSCodeConfigStorage implements UserConfigStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Get a value from globalState
   */
  get<T>(key: string): T | undefined {
    return this.context.globalState.get<T>(key);
  }

  /**
   * Update a value in globalState
   */
  async update(key: string, value: unknown): Promise<void> {
    await this.context.globalState.update(key, value);
  }
}

/**
 * Create configuration change watcher
 */
export function createConfigWatcher(
  onConfigChange: () => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('uniedit')) {
      onConfigChange();
    }
  });
}

/**
 * Migrate from legacy configuration format
 * This handles migration from the old uniedit.providers format to the new platform config
 */
export async function migrateFromLegacyConfig(
  context: vscode.ExtensionContext
): Promise<void> {
  // First, fix any existing providerOverrides that use baseUrl instead of apiUrl
  await fixBaseUrlToApiUrl(context);

  // Fix prompts with incorrect enabled values (remove builtin prompts from user config)
  await fixPromptsEnabled(context);

  // Debug: Log all relevant globalState keys
  const debugLegacyProviders = context.globalState.get<Record<string, unknown>>('uniedit.providers');
  const debugUserConfig = context.globalState.get<{
    providerOverrides?: Record<string, unknown>;
  }>('uniedit.platform.userConfig');
  const migrationDone = context.globalState.get<boolean>('uniedit.platform.migrationDone');

  // Force re-migration if providerOverrides is empty but legacy data exists
  if (debugLegacyProviders && Object.keys(debugLegacyProviders).length > 0) {
    const hasValidOverrides = debugUserConfig?.providerOverrides &&
      Object.values(debugUserConfig.providerOverrides).some((o: any) => o?.apiKey);

    if (!hasValidOverrides) {
      await context.globalState.update('uniedit.platform.migrationDone', false);
    }
  }

  // Check if migration already done
  const migrationKey = 'uniedit.platform.migrationDone';
  // Re-read after potential reset
  const shouldSkipMigration = context.globalState.get<boolean>(migrationKey);
  if (shouldSkipMigration) {
    return;
  }

  // Migrate AI provider configs
  const legacyProviders = context.globalState.get<Record<string, {
    name?: string;
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }>>('uniedit.providers', {});

  if (Object.keys(legacyProviders).length > 0) {
    // Build provider overrides from legacy config
    const providerOverrides: Record<string, { apiKey?: string; apiUrl?: string }> = {};

    for (const [providerId, config] of Object.entries(legacyProviders)) {
      if (config?.apiKey) {
        // Map legacy provider IDs to new provider IDs
        const newProviderId = mapLegacyProviderId(providerId);
        providerOverrides[newProviderId] = {
          apiKey: config.apiKey,
          apiUrl: config.baseUrl,
        };
      }
    }

    // Save to new location
    const existingUserConfig = context.globalState.get<{
      providerOverrides?: Record<string, unknown>;
    }>('uniedit.platform.userConfig', {});

    existingUserConfig.providerOverrides = {
      ...existingUserConfig.providerOverrides,
      ...providerOverrides,
    };

    await context.globalState.update('uniedit.platform.userConfig', existingUserConfig);
  }

  // Mark migration as done
  await context.globalState.update(migrationKey, true);
}

/**
 * Fix existing providerOverrides that use baseUrl instead of apiUrl
 */
async function fixBaseUrlToApiUrl(context: vscode.ExtensionContext): Promise<void> {
  // Use versioned key to allow re-running fix when needed
  const fixKey = 'uniedit.platform.baseUrlFixDone.v2';
  if (context.globalState.get<boolean>(fixKey)) {
    return;
  }

  const userConfig = context.globalState.get<{
    providerOverrides?: Record<string, { apiKey?: string; baseUrl?: string; apiUrl?: string }>;
  }>('uniedit.platform.userConfig');

  if (userConfig?.providerOverrides) {
    let needsUpdate = false;
    const fixedOverrides: Record<string, { apiKey?: string; apiUrl?: string }> = {};

    for (const [providerId, override] of Object.entries(userConfig.providerOverrides)) {
      // If override has baseUrl but no apiUrl, convert it
      if (override.baseUrl && !override.apiUrl) {
        fixedOverrides[providerId] = {
          apiKey: override.apiKey,
          apiUrl: override.baseUrl,
        };
        needsUpdate = true;
      } else {
        fixedOverrides[providerId] = {
          apiKey: override.apiKey,
          apiUrl: override.apiUrl,
        };
      }
    }

    if (needsUpdate) {
      userConfig.providerOverrides = fixedOverrides;
      await context.globalState.update('uniedit.platform.userConfig', userConfig);
    }
  }

  await context.globalState.update(fixKey, true);
}

/**
 * Fix prompts with incorrect enabled values
 * Remove builtin prompts from user config to let builtin defaults take effect
 */
async function fixPromptsEnabled(context: vscode.ExtensionContext): Promise<void> {
  const fixKey = 'uniedit.platform.promptsEnabledFix.v1';
  if (context.globalState.get<boolean>(fixKey)) {
    return;
  }

  // List of builtin prompt IDs that should not be stored in user config
  const builtinPromptIds = ['default', 'coder', 'screenwriter', 'storyboard', 'image-creator', 'video-creator'];

  const userConfig = context.globalState.get<{
    prompts?: Array<{ id: string; enabled?: boolean; [key: string]: unknown }>;
    promptOverrides?: Record<string, { enabled?: boolean; [key: string]: unknown }>;
  }>('uniedit.platform.userConfig');

  if (userConfig) {
    let needsUpdate = false;

    // Remove builtin prompts from user.prompts array
    if (userConfig.prompts && userConfig.prompts.length > 0) {
      const originalCount = userConfig.prompts.length;
      userConfig.prompts = userConfig.prompts.filter(p => !builtinPromptIds.includes(p.id));
      if (userConfig.prompts.length !== originalCount) {
        needsUpdate = true;
      }
    }

    // Also clean up promptOverrides for builtin prompts (optional, but cleaner)
    if (userConfig.promptOverrides) {
      for (const builtinId of builtinPromptIds) {
        if (userConfig.promptOverrides[builtinId]) {
          delete userConfig.promptOverrides[builtinId];
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      await context.globalState.update('uniedit.platform.userConfig', userConfig);
    }
  }

  await context.globalState.update(fixKey, true);
}

/**
 * Map legacy provider ID to new platform provider ID
 */
function mapLegacyProviderId(legacyId: string): string {
  const mapping: Record<string, string> = {
    'openai': 'openai',
    'claude': 'anthropic',
    'gemini': 'google',
    'kimi': 'kimi',
    'glm': 'zhipu',
  };

  return mapping[legacyId] || legacyId;
}
