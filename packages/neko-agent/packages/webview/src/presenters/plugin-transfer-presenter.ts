import type {
  NekoPluginKey,
  PluginTransferMediaType,
  PluginTransferTarget,
  PluginsAvailable,
} from '@neko-agent/types';

export interface PluginTransferTargetProjection {
  id: PluginTransferTarget;
  label: 'Canvas' | 'Timeline' | 'Explorer';
  accepts: readonly PluginTransferMediaType[];
  requiresPlugin: NekoPluginKey | null;
}

export interface PluginTransferMenuProjection {
  targets: PluginTransferTargetProjection[];
  showMenu: boolean;
}

const PLUGIN_TRANSFER_TARGETS: readonly PluginTransferTargetProjection[] = [
  {
    id: 'canvas',
    label: 'Canvas',
    accepts: ['image'],
    requiresPlugin: 'canvas',
  },
  {
    id: 'cut',
    label: 'Timeline',
    accepts: ['image', 'video', 'audio'],
    requiresPlugin: 'cut',
  },
  {
    id: 'explorer',
    label: 'Explorer',
    accepts: ['image', 'video', 'audio'],
    requiresPlugin: null,
  },
];

export function projectPluginTransferMenu(input: {
  mediaType: PluginTransferMediaType;
  plugins: PluginsAvailable;
}): PluginTransferMenuProjection {
  const targets = PLUGIN_TRANSFER_TARGETS.filter((target) => {
    if (!target.accepts.includes(input.mediaType)) return false;
    if (target.requiresPlugin && !input.plugins[target.requiresPlugin]) return false;
    return true;
  });

  return {
    targets,
    showMenu: targets.length > 0,
  };
}
