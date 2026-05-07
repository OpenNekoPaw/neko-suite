import {
  buildPluginSlashCommandCommand,
  buildPluginSlashCommandInvocation,
  buildPluginsAvailableMessage,
  NEKO_PLUGIN_EXTENSION_IDS,
  type InvokePluginSlashCommandWebviewMessage,
  type NekoPluginKey,
  type PluginSlashCommandDef,
  type PluginSlashCommandInvocation,
  type PluginTransferCommandPlan,
  type PluginTransferPayload,
  type PluginTransferAssetRef,
  type PluginsAvailableMessage,
  type PluginsAvailable,
  type ProjectPluginsAvailableInput,
  type RegisteredPluginSlashCommand,
} from '@neko-agent/types';

type RuntimePluginTransferBuildPayload = Exclude<PluginTransferPayload, { kind: 'assetBatch' }>;

export interface BuildPluginTransferPlanInput {
  readonly target: string;
  readonly assetPath?: string;
  readonly mediaType?: string;
  readonly payload?: RuntimePluginTransferBuildPayload;
}

export interface ExpandPluginTransferInputsInput {
  readonly target: string;
  readonly assetPath?: string;
  readonly mediaType?: string;
  readonly payload?: PluginTransferPayload;
}

export interface RuntimePluginSlashCommandDispatch {
  readonly command: string;
  readonly invocation: PluginSlashCommandInvocation;
}

interface RuntimePluginSlashCommandRegistryEntry {
  readonly extensionId: string;
  readonly commands: readonly PluginSlashCommandDef[];
}

export interface RuntimePluginSlashCommandRegistry {
  register(extensionId: string, commands: readonly PluginSlashCommandDef[]): void;
  unregister(extensionId: string): boolean;
  getAll(): RegisteredPluginSlashCommand[];
  clear(): void;
}

export function createRuntimePluginSlashCommandRegistry(): RuntimePluginSlashCommandRegistry {
  return new DefaultRuntimePluginSlashCommandRegistry();
}

export function buildRuntimePluginTransferPlan(
  input: BuildPluginTransferPlanInput,
): PluginTransferCommandPlan {
  const payload =
    input.payload ??
    (input.assetPath
      ? {
          kind: 'singleAsset' as const,
          asset: {
            path: input.assetPath,
            ...(isPluginTransferMediaType(input.mediaType) ? { mediaType: input.mediaType } : {}),
          },
        }
      : undefined);

  if (!payload) {
    return { status: 'unsupported', target: input.target };
  }

  if (payload.kind === 'canvasStoryboard') {
    if (input.target === 'canvas') {
      return {
        status: 'execute-command',
        command: 'neko.canvas.importStoryboard',
        payload: payload.storyboard,
      };
    }
    return { status: 'unsupported', target: input.target };
  }

  if (payload.kind === 'cutStoryboard') {
    if (input.target === 'cut') {
      return {
        status: 'execute-command',
        command: 'neko.cut.importStoryboard',
        payload: payload.storyboard,
      };
    }
    return { status: 'unsupported', target: input.target };
  }

  assertSingleTransferPayload(payload);

  if (input.target === 'canvas') {
    return {
      status: 'execute-command',
      command: 'neko.canvas.importAsset',
      payload: {
        path: payload.asset.path,
        ...(payload.asset.mediaType ? { type: payload.asset.mediaType } : {}),
        ...(payload.asset.name ? { name: payload.asset.name } : {}),
      },
    };
  }

  if (input.target === 'cut') {
    return {
      status: 'execute-command',
      command: 'neko.cut.importGeneratedClip',
      payload: {
        assetPath: payload.asset.path,
        ...(payload.asset.mediaType ? { mediaType: payload.asset.mediaType } : {}),
        ...(payload.asset.name ? { name: payload.asset.name } : {}),
      },
    };
  }

  if (input.target === 'sketch' && payload.asset.mediaType === 'image') {
    return {
      status: 'execute-command',
      command: 'neko.sketch.importAsset',
      payload: {
        path: payload.asset.path,
        ...(payload.asset.name ? { name: payload.asset.name } : {}),
      },
    };
  }

  if (input.target === 'model' && payload.asset.mediaType === 'model') {
    return {
      status: 'execute-command',
      command: 'neko.model.importAsset',
      payload: {
        path: payload.asset.path,
        ...(payload.asset.name ? { name: payload.asset.name } : {}),
      },
    };
  }

  if (input.target === 'explorer') {
    return {
      status: 'reveal-file',
      filePath: payload.asset.path,
    };
  }

  return { status: 'unsupported', target: input.target };
}

export function expandRuntimePluginTransferInputs(
  input: ExpandPluginTransferInputsInput,
): readonly BuildPluginTransferPlanInput[] {
  if (input.payload?.kind !== 'assetBatch') return [input];
  return input.payload.assets.map((asset) => ({
    target: input.target,
    payload: { kind: 'singleAsset', asset },
  }));
}

function assertSingleTransferPayload(
  payload: RuntimePluginTransferBuildPayload,
): asserts payload is { readonly kind: 'singleAsset'; readonly asset: PluginTransferAssetRef } {
  if (payload.kind !== 'singleAsset') {
    throw new Error(`Unsupported plugin transfer payload kind: ${payload.kind}`);
  }
}

function isPluginTransferMediaType(
  value: string | undefined,
): value is 'image' | 'video' | 'audio' | 'model' {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'model';
}

export function buildRuntimePluginSlashCommandDispatch(
  message: InvokePluginSlashCommandWebviewMessage,
): RuntimePluginSlashCommandDispatch {
  return {
    command: buildPluginSlashCommandCommand(message),
    invocation: buildPluginSlashCommandInvocation(message),
  };
}

export function buildRuntimePluginsAvailableMessage(
  input: ProjectPluginsAvailableInput,
): PluginsAvailableMessage {
  return buildPluginsAvailableMessage(projectRuntimeNekoPluginsAvailable(input));
}

export function projectRuntimeNekoPluginsAvailable(
  input: ProjectPluginsAvailableInput,
): PluginsAvailable {
  return Object.fromEntries(
    Object.entries(NEKO_PLUGIN_EXTENSION_IDS).map(([plugin, extensionId]) => [
      plugin,
      input.hasExtension(extensionId),
    ]),
  ) as Record<NekoPluginKey, boolean>;
}

class DefaultRuntimePluginSlashCommandRegistry implements RuntimePluginSlashCommandRegistry {
  private readonly entries = new Map<string, RuntimePluginSlashCommandRegistryEntry>();

  register(extensionId: string, commands: readonly PluginSlashCommandDef[]): void {
    this.entries.set(extensionId, {
      extensionId,
      commands: commands.map((command) => ({ ...command })),
    });
  }

  unregister(extensionId: string): boolean {
    return this.entries.delete(extensionId);
  }

  getAll(): RegisteredPluginSlashCommand[] {
    return Array.from(this.entries.values())
      .sort((a, b) => a.extensionId.localeCompare(b.extensionId))
      .flatMap((entry) =>
        entry.commands.map((command) => ({
          ...command,
          extensionId: entry.extensionId,
        })),
      );
  }

  clear(): void {
    this.entries.clear();
  }
}

export type { PluginSlashCommandDef, RegisteredPluginSlashCommand };
