import { create } from 'zustand';

interface NodePlaybackState {
  currentTime: number;
  duration: number;
  wasPlaying: boolean;
  savedAt: number;
}

export type PlaybackSurfaceKind = 'inline' | 'overlay';

export interface PlaybackHandoffRequest {
  assetPath: string;
  mediaType: 'video' | 'audio';
  fromSurfaceId: string;
  toKind: PlaybackSurfaceKind;
  startTime: number;
}

interface ActivePlaybackState {
  assetPath: string;
  mediaType: 'video' | 'audio';
  surfaceId: string;
  surfaceKind: PlaybackSurfaceKind;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  updatedAt: number;
}

interface PlaybackStore {
  playbacks: Map<string, NodePlaybackState>;
  activePlayback: ActivePlaybackState | null;
  handoffRequest: PlaybackHandoffRequest | null;
  savePlayback: (assetPath: string, state: Omit<NodePlaybackState, 'savedAt'>) => void;
  getPlayback: (assetPath: string) => NodePlaybackState | undefined;
  clearPlayback: (assetPath: string) => void;
  startActivePlayback: (
    state: Omit<ActivePlaybackState, 'updatedAt' | 'isPlaying'> & { isPlaying?: boolean },
  ) => void;
  updateActivePlayback: (
    assetPath: string,
    surfaceId: string,
    patch: Partial<Pick<ActivePlaybackState, 'currentTime' | 'duration' | 'isPlaying'>>,
  ) => void;
  stopActivePlayback: (assetPath: string, surfaceId: string, currentTime: number) => void;
  requestHandoff: (request: PlaybackHandoffRequest) => void;
  consumeHandoff: (assetPath: string, toKind: PlaybackSurfaceKind) => PlaybackHandoffRequest | null;
}

const STALE_TIMEOUT_MS = 60_000;

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  playbacks: new Map(),
  activePlayback: null,
  handoffRequest: null,

  savePlayback: (assetPath, state) => {
    set((prev) => {
      const next = new Map(prev.playbacks);
      next.set(assetPath, { ...state, savedAt: Date.now() });
      return { playbacks: next };
    });
  },

  getPlayback: (assetPath) => {
    const entry = get().playbacks.get(assetPath);
    if (!entry) return undefined;
    if (Date.now() - entry.savedAt > STALE_TIMEOUT_MS) {
      get().clearPlayback(assetPath);
      return undefined;
    }
    return entry;
  },

  clearPlayback: (assetPath) => {
    set((prev) => {
      const next = new Map(prev.playbacks);
      next.delete(assetPath);
      return { playbacks: next };
    });
  },

  startActivePlayback: (state) => {
    set({
      activePlayback: {
        ...state,
        isPlaying: state.isPlaying ?? true,
        updatedAt: Date.now(),
      },
    });
  },

  updateActivePlayback: (assetPath, surfaceId, patch) => {
    set((prev) => {
      const active = prev.activePlayback;
      if (!active || active.assetPath !== assetPath || active.surfaceId !== surfaceId) {
        return {};
      }
      return {
        activePlayback: {
          ...active,
          ...patch,
          updatedAt: Date.now(),
        },
      };
    });
  },

  stopActivePlayback: (assetPath, surfaceId, currentTime) => {
    set((prev) => {
      const active = prev.activePlayback;
      if (!active || active.assetPath !== assetPath || active.surfaceId !== surfaceId) {
        return {};
      }
      return {
        activePlayback: null,
        playbacks: withSavedPlayback(prev.playbacks, assetPath, {
          currentTime,
          duration: active.duration,
          wasPlaying: false,
        }),
      };
    });
  },

  requestHandoff: (request) => {
    set({ handoffRequest: request });
  },

  consumeHandoff: (assetPath, toKind) => {
    const request = get().handoffRequest;
    if (!request || request.assetPath !== assetPath || request.toKind !== toKind) {
      return null;
    }
    set({ handoffRequest: null });
    return request;
  },
}));

function withSavedPlayback(
  playbacks: Map<string, NodePlaybackState>,
  assetPath: string,
  state: Omit<NodePlaybackState, 'savedAt'>,
): Map<string, NodePlaybackState> {
  const next = new Map(playbacks);
  next.set(assetPath, { ...state, savedAt: Date.now() });
  return next;
}
