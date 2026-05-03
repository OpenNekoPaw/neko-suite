export const NEKO_PLUGIN_EXTENSION_IDS = {
  canvas: 'neko.nekocanvas',
  cut: 'neko.nekocut',
  sketch: 'neko.neko-sketch',
} as const;

export type NekoPluginKey = keyof typeof NEKO_PLUGIN_EXTENSION_IDS;

export type PluginTransferTarget = NekoPluginKey | 'explorer';

export type PluginTransferMediaType = 'image' | 'video' | 'audio';

export type PluginTransferCommandPlan =
  | {
      status: 'execute-command';
      command: 'neko.canvas.importAsset' | 'neko.cut.importGeneratedClip';
      payload: Record<string, string>;
    }
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
