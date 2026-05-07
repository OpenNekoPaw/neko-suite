import type { CanvasStoryboardPayload } from '@neko/shared';

export const NEKO_PLUGIN_EXTENSION_IDS = {
  canvas: 'neko.nekocanvas',
  cut: 'neko.nekocut',
  sketch: 'neko.neko-sketch',
  model: 'neko.neko-model',
} as const;

export type NekoPluginKey = keyof typeof NEKO_PLUGIN_EXTENSION_IDS;

export type PluginTransferTarget = NekoPluginKey | 'explorer';

export type PluginTransferMediaType = 'image' | 'video' | 'audio' | 'model';

export interface PluginTransferAssetRef {
  readonly path: string;
  readonly mediaType?: PluginTransferMediaType;
  readonly name?: string;
}

export interface PluginTransferCutStoryboardShotBase {
  readonly id: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly label: string;
}

export type PluginTransferCutStoryboardShot =
  | (PluginTransferCutStoryboardShotBase & {
      readonly imagePath: string;
      readonly imageDataUrl?: string;
    })
  | (PluginTransferCutStoryboardShotBase & {
      readonly imagePath?: string;
      readonly imageDataUrl: string;
    });

export interface PluginTransferCutStoryboardPayload {
  readonly projectName: string;
  readonly shots: readonly PluginTransferCutStoryboardShot[];
}

export type PluginTransferPayload =
  | {
      readonly kind: 'singleAsset';
      readonly asset: PluginTransferAssetRef;
    }
  | {
      readonly kind: 'assetBatch';
      readonly assets: readonly PluginTransferAssetRef[];
    }
  | {
      readonly kind: 'canvasStoryboard';
      readonly storyboard: CanvasStoryboardPayload;
    }
  | {
      readonly kind: 'cutStoryboard';
      readonly storyboard: PluginTransferCutStoryboardPayload;
    };

export interface PluginTransferCanvasImportAssetPayload {
  readonly path: string;
  readonly type?: PluginTransferMediaType;
  readonly name?: string;
}

export interface PluginTransferCutImportGeneratedClipPayload {
  readonly assetPath: string;
  readonly mediaType?: PluginTransferMediaType;
  readonly name?: string;
  readonly duration?: number;
  readonly trackIndex?: number;
}

export interface PluginTransferPathImportAssetPayload {
  readonly path: string;
  readonly name?: string;
}

export interface PluginTransferCommandPlanMap {
  readonly 'neko.canvas.importAsset': PluginTransferCanvasImportAssetPayload;
  readonly 'neko.canvas.importStoryboard': CanvasStoryboardPayload;
  readonly 'neko.sketch.importAsset': PluginTransferPathImportAssetPayload;
  readonly 'neko.model.importAsset': PluginTransferPathImportAssetPayload;
  readonly 'neko.cut.importStoryboard': PluginTransferCutStoryboardPayload;
  readonly 'neko.cut.importGeneratedClip': PluginTransferCutImportGeneratedClipPayload;
}

export type PluginTransferCommand = keyof PluginTransferCommandPlanMap;

export type PluginTransferCommandPayload<Command extends PluginTransferCommand> =
  PluginTransferCommandPlanMap[Command];

export type PluginTransferCommandPlan =
  | {
      [Command in PluginTransferCommand]: {
        status: 'execute-command';
        command: Command;
        payload: PluginTransferCommandPlanMap[Command];
      };
    }[PluginTransferCommand]
  | {
      status: 'reveal-file';
      filePath: string;
    }
  | {
      status: 'unsupported';
      target: string;
    };

export interface ProjectPluginsAvailableInput {
  readonly hasExtension: (extensionId: string) => boolean;
}
