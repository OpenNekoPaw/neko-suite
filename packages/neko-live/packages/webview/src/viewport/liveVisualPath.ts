export type LiveCompositorStatus = 'idle' | 'starting' | 'active' | 'unavailable';
export type LiveVisualPath = 'compositor' | 'local-preview' | 'empty';

export interface SelectLiveVisualPathOptions {
  readonly compositorStatus: LiveCompositorStatus;
  readonly hasController: boolean;
  readonly hasAvatar: boolean;
  readonly localPreviewEnabled: boolean;
}

export function selectLiveVisualPath(options: SelectLiveVisualPathOptions): LiveVisualPath {
  if (options.compositorStatus === 'active' && options.hasController) {
    return 'compositor';
  }
  if (options.hasAvatar && options.localPreviewEnabled) {
    return 'local-preview';
  }
  return 'empty';
}
