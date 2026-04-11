import { createContext, useContext, type ReactNode } from 'react';
import type { InitialState } from '../components/MediaDiff/types';
import type { IWebviewBridge } from './bridge';

export interface IMediaDiffRuntime {
  bridge: IWebviewBridge;
  initialState: InitialState;
}

const MediaDiffRuntimeContext = createContext<IMediaDiffRuntime | null>(null);

interface MediaDiffRuntimeProviderProps {
  runtime: IMediaDiffRuntime;
  children: ReactNode;
}

export function MediaDiffRuntimeProvider({
  runtime,
  children,
}: MediaDiffRuntimeProviderProps): JSX.Element {
  return (
    <MediaDiffRuntimeContext.Provider value={runtime}>{children}</MediaDiffRuntimeContext.Provider>
  );
}

export function useMediaDiffRuntime(): IMediaDiffRuntime {
  const runtime = useContext(MediaDiffRuntimeContext);
  if (!runtime) {
    throw new Error('useMediaDiffRuntime must be used within a MediaDiffRuntimeProvider');
  }
  return runtime;
}
