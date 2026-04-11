import type { MediaType } from '@neko/shared';
import type { InitialState } from '../components/MediaDiff/types';
import type { IWebviewBridge } from './bridge';

const DEFAULT_INITIAL_STATE: InitialState = {
  mediaType: 'image' as MediaType,
  fileName: '',
  isLocalComparison: false,
  fileUri: '',
};

declare global {
  interface Window {
    initialState?: InitialState;
  }
}

export function getMediaDiffInitialState(bridge: IWebviewBridge): InitialState {
  const persistedState = bridge.getState<Partial<InitialState>>();
  const injectedState = window.initialState;

  return {
    ...DEFAULT_INITIAL_STATE,
    ...persistedState,
    ...injectedState,
  };
}
