import type {
  CanvasAgentContentPayload,
  CanvasAgentTargetRef,
  CanvasStoryboardPayload,
  DocumentArchiveResourceRef,
  ResourceRef,
  StoryboardTextCue,
  StoryboardVoiceCue,
} from '@neko/shared';

export const NEKO_PLUGIN_EXTENSION_IDS = {
  canvas: 'neko.neko-canvas',
  cut: 'neko.neko-cut',
  sketch: 'neko.neko-sketch',
  model: 'neko.neko-model',
} as const;

export type NekoPluginKey = keyof typeof NEKO_PLUGIN_EXTENSION_IDS;

export type PluginTransferTarget = NekoPluginKey | 'explorer';

export type PluginTransferMediaType = 'image' | 'video' | 'audio' | 'model';

export type PluginTransferContentFormat = 'plain' | 'markdown' | 'json' | 'prompt';

export type PluginTransferTargetMode = 'insert' | 'append' | 'replace' | 'apply' | 'create-child';

export interface PluginTransferTargetRef extends CanvasAgentTargetRef {
  readonly plugin?: PluginTransferTarget;
}

export interface PluginTransferProvenance {
  readonly source?: 'agent' | 'webview' | 'tool' | 'user' | 'plugin';
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly toolCallId?: string;
  readonly label?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface PluginTransferAssetRef {
  readonly path?: string;
  readonly mediaType?: PluginTransferMediaType;
  readonly name?: string;
  /**
   * Canonical structured source reference for document/archive-derived assets.
   * Provenance metadata may mirror this field for backward-compatible routing,
   * but consumers should prefer this top-level asset field when present.
   */
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
  readonly target?: PluginTransferTargetRef;
  readonly provenance?: PluginTransferProvenance;
}

export interface PluginTransferCutStoryboardShotBase {
  readonly id: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly textCues?: readonly StoryboardTextCue[];
  readonly voiceCues?: readonly StoryboardVoiceCue[];
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
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    }
  | {
      readonly kind: 'assetBatch';
      readonly assets: readonly PluginTransferAssetRef[];
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    }
  | {
      readonly kind: 'canvasStoryboard';
      readonly storyboard: CanvasStoryboardPayload;
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    }
  | {
      readonly kind: 'cutStoryboard';
      readonly storyboard: PluginTransferCutStoryboardPayload;
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    }
  | {
      readonly kind: 'canvasText';
      readonly text: string;
      readonly title?: string;
      readonly format?: Exclude<PluginTransferContentFormat, 'prompt'>;
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    }
  | {
      readonly kind: 'canvasPrompt';
      readonly prompt: string;
      readonly title?: string;
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    }
  | {
      readonly kind: 'canvasStructuredContent';
      readonly content: unknown;
      readonly title?: string;
      readonly format?: PluginTransferContentFormat;
      readonly target?: PluginTransferTargetRef;
      readonly provenance?: PluginTransferProvenance;
    };

export interface PluginTransferCanvasImportAssetPayload {
  readonly path?: string;
  readonly type?: PluginTransferMediaType;
  readonly name?: string;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
  readonly target?: PluginTransferTargetRef;
  readonly provenance?: PluginTransferProvenance;
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

export type PluginTransferCanvasAgentContentPayload = CanvasAgentContentPayload;

export interface PluginTransferCommandPlanMap {
  readonly 'neko.canvas.importAsset': PluginTransferCanvasImportAssetPayload;
  readonly 'neko.canvas.importStoryboard': CanvasStoryboardPayload;
  readonly 'neko.canvas.importAgentContent': PluginTransferCanvasAgentContentPayload;
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
      reason?: string;
    };

export interface ProjectPluginsAvailableInput {
  readonly hasExtension: (extensionId: string) => boolean;
}
