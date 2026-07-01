import {
  createPlatform,
  FileUserConfigManager,
  toSharedService,
  type Platform,
} from '@neko/platform';
import type { IService } from '@neko/shared';
import type { AgentRealApiProfileConfig } from './profile-config';
import { createScriptedService } from './mock-service';

export interface PlatformHarness {
  readonly profile: AgentRealApiProfileConfig;
  readonly platform?: Platform;
  readonly service: IService;
  readonly providerId?: string;
  readonly modelId?: string;
  dispose(): void;
}

export interface CreatePlatformHarnessOptions {
  readonly profile: AgentRealApiProfileConfig;
  readonly toolRegistry: import('@neko/shared').IToolRegistry;
  readonly taskManager?: Parameters<typeof createPlatform>[0]['taskManager'];
  readonly workspacePath?: string;
}

export function createPlatformHarness(options: CreatePlatformHarnessOptions): PlatformHarness {
  if (options.profile.profile === 'mock') {
    return {
      profile: options.profile,
      service: createScriptedService({ steps: [{ type: 'text', content: 'mock platform ok' }] }),
      dispose: () => {},
    };
  }

  if (!options.profile.configPath) {
    throw new Error(`Real profile "${options.profile.profile}" requires a config path`);
  }

  const platform = createPlatform({
    userConfigManager: new FileUserConfigManager({ filePath: options.profile.configPath }),
    toolRegistry: options.toolRegistry,
    ...(options.taskManager ? { taskManager: options.taskManager } : {}),
    ...(options.workspacePath ? { workspacePath: options.workspacePath } : {}),
  });
  const settings = platform.config.getAssistantRuntimeSettingsSnapshot();
  return {
    profile: options.profile,
    platform,
    service: toSharedService(platform.createService()),
    providerId: settings.selectedProviderId,
    modelId: settings.selectedModelId,
    dispose: () => platform.dispose(),
  };
}
