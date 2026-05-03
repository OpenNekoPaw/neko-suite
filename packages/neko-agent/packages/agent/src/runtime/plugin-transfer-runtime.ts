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
  type PluginsAvailableMessage,
  type PluginsAvailable,
  type ProjectPluginsAvailableInput,
  type RegisteredPluginSlashCommand,
} from '@neko-agent/types';

export interface BuildPluginTransferPlanInput {
  readonly target: string;
  readonly assetPath: string;
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
  if (input.target === 'canvas') {
    return {
      status: 'execute-command',
      command: 'neko.canvas.importAsset',
      payload: { path: input.assetPath },
    };
  }

  if (input.target === 'cut') {
    return {
      status: 'execute-command',
      command: 'neko.cut.importGeneratedClip',
      payload: { assetPath: input.assetPath },
    };
  }

  if (input.target === 'explorer') {
    return {
      status: 'reveal-file',
      filePath: input.assetPath,
    };
  }

  return { status: 'unsupported', target: input.target };
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
