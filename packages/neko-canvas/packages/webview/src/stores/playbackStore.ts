import { create } from 'zustand';

interface NodePlaybackState {
  currentTime: number;
  duration: number;
  wasPlaying: boolean;
  savedAt: number;
}

interface PlaybackStore {
  playbacks: Map<string, NodePlaybackState>;
  savePlayback: (assetPath: string, state: Omit<NodePlaybackState, 'savedAt'>) => void;
  getPlayback: (assetPath: string) => NodePlaybackState | undefined;
  clearPlayback: (assetPath: string) => void;
}

const STALE_TIMEOUT_MS = 60_000;

export const usePlaybackStore = create<PlaybackStore>((set, get) => ({
  playbacks: new Map(),

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
}));
