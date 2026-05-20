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
  type PluginTransferTargetRef,
  type PluginsAvailableMessage,
  type PluginsAvailable,
  type ProjectPluginsAvailableInput,
  type RegisteredPluginSlashCommand,
} from '@neko-agent/types';
import { isDocumentArchiveResourceRef, type DocumentArchiveResourceRef } from '@neko/shared';

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
    return { status: 'unsupported', target: input.target, reason: 'unsupported-structured-target' };
  }

  if (payload.kind === 'cutStoryboard') {
    if (input.target === 'cut') {
      return {
        status: 'execute-command',
        command: 'neko.cut.importStoryboard',
        payload: payload.storyboard,
      };
    }
    return { status: 'unsupported', target: input.target, reason: 'unsupported-structured-target' };
  }

  if (
    payload.kind === 'canvasText' ||
    payload.kind === 'canvasPrompt' ||
    payload.kind === 'canvasStructuredContent'
  ) {
    if (input.target !== 'canvas') {
      return { status: 'unsupported', target: input.target, reason: 'unsupported-content-target' };
    }
    const safetyFailure = validateCanvasContentTransferTarget(payload.target);
    if (safetyFailure) {
      return safetyFailure;
    }
    if (payload.kind === 'canvasText') {
      return {
        status: 'execute-command',
        command: 'neko.canvas.importAgentContent',
        payload: {
          kind: 'text',
          text: payload.text,
          ...(payload.title ? { title: payload.title } : {}),
          ...(payload.format ? { format: payload.format } : {}),
          ...(payload.target ? { target: payload.target } : {}),
          ...(payload.provenance ? { provenance: payload.provenance } : {}),
        },
      };
    }
    if (payload.kind === 'canvasPrompt') {
      return {
        status: 'execute-command',
        command: 'neko.canvas.importAgentContent',
        payload: {
          kind: 'prompt',
          prompt: payload.prompt,
          ...(payload.title ? { title: payload.title } : {}),
          ...(payload.target ? { target: payload.target } : {}),
          ...(payload.provenance ? { provenance: payload.provenance } : {}),
        },
      };
    }
    return {
      status: 'execute-command',
      command: 'neko.canvas.importAgentContent',
      payload: {
        kind: 'structured',
        content: payload.content,
        ...(payload.title ? { title: payload.title } : {}),
        ...(payload.format ? { format: payload.format } : {}),
        ...(payload.target ? { target: payload.target } : {}),
        ...(payload.provenance ? { provenance: payload.provenance } : {}),
      },
    };
  }

  assertSingleTransferPayload(payload);

  if (input.target === 'canvas') {
    const documentResourceRef = readDocumentResourceRef(payload.asset, payload.provenance);
    return {
      status: 'execute-command',
      command: 'neko.canvas.importAsset',
      payload: {
        path: payload.asset.path,
        ...(payload.asset.mediaType ? { type: payload.asset.mediaType } : {}),
        ...(payload.asset.name ? { name: payload.asset.name } : {}),
        ...(documentResourceRef ? { documentResourceRef } : {}),
        ...((payload.target ?? payload.asset.target)
          ? { target: payload.target ?? payload.asset.target }
          : {}),
        ...((payload.provenance ?? payload.asset.provenance)
          ? { provenance: payload.provenance ?? payload.asset.provenance }
          : {}),
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
  if (input.payload?.kind !== 'assetBatch') {
    return [input as BuildPluginTransferPlanInput];
  }
  const batch = input.payload;
  return batch.assets.map((asset) => ({
    target: input.target,
    payload: {
      kind: 'singleAsset',
      asset,
      ...resolveBatchTransferDefaults(asset, batch),
    },
  }));
}

function assertSingleTransferPayload(
  payload: RuntimePluginTransferBuildPayload,
): asserts payload is Extract<PluginTransferPayload, { kind: 'singleAsset' }> {
  if (payload.kind !== 'singleAsset') {
    throw new Error(`Unsupported plugin transfer payload kind: ${payload.kind}`);
  }
}

function isPluginTransferMediaType(
  value: string | undefined,
): value is 'image' | 'video' | 'audio' | 'model' {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'model';
}

function resolveBatchTransferDefaults(
  asset: PluginTransferAssetRef,
  batch: Extract<PluginTransferPayload, { kind: 'assetBatch' }>,
): Pick<Extract<PluginTransferPayload, { kind: 'singleAsset' }>, 'target' | 'provenance'> {
  return {
    ...(!asset.target && batch.target ? { target: batch.target } : {}),
    ...(!asset.provenance && batch.provenance ? { provenance: batch.provenance } : {}),
  };
}

function readDocumentResourceRef(
  asset: PluginTransferAssetRef,
  payloadProvenance: PluginTransferAssetRef['provenance'] | undefined,
): DocumentArchiveResourceRef | undefined {
  const candidates = [
    asset.documentResourceRef,
    asset.provenance?.metadata?.['documentResourceRef'],
    payloadProvenance?.metadata?.['documentResourceRef'],
  ];
  return candidates.find(isDocumentArchiveResourceRef);
}

function validateCanvasContentTransferTarget(
  target: PluginTransferTargetRef | undefined,
): PluginTransferCommandPlan | null {
  if (!target) return null;
  if (target.mode === 'replace' && !target.nodeId && !target.slotId && !target.fieldPath) {
    return {
      status: 'unsupported',
      target: 'canvas',
      reason: 'replace-mode-requires-explicit-target',
    };
  }
  return null;
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
