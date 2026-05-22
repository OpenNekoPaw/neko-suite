export type LiveCompositorStatus = 'idle' | 'starting' | 'active' | 'unavailable';
export type LiveVisualPath = 'compositor' | 'local-fallback' | 'empty';

export interface SelectLiveVisualPathOptions {
  readonly compositorStatus: LiveCompositorStatus;
  readonly hasController: boolean;
  readonly hasAvatar: boolean;
  readonly fallbackEnabled: boolean;
}

export function selectLiveVisualPath(options: SelectLiveVisualPathOptions): LiveVisualPath {
  if (options.compositorStatus === 'active' && options.hasController) {
    return 'compositor';
  }
  if (options.hasAvatar && options.fallbackEnabled) {
    return 'local-fallback';
  }
  return 'empty';
}
