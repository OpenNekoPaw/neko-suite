import { create } from 'zustand';

interface NodePlaybackState {
  currentTime: number;
  duration: number;
  wasPlaying: boolean;
  savedAt: number;
}

export type PlaybackSurfaceKind = 'inline' | 'overlay';
export type PlaybackWorkspacePane = 'canvas' | 'stage' | 'route';
export type PlaybackWorkspaceFocusOwner = 'canvas' | 'stage' | 'route' | 'toolbar';
export type PlaybackWorkspacePlaybackState = 'idle' | 'playing' | 'paused' | 'stale';

export interface PlaybackWorkspaceLayoutState {
  readonly stageWidthPx: number;
  readonly routeHeightPx: number;
}

export interface PlaybackSessionState {
  readonly visible: boolean;
  readonly panes: Readonly<Record<PlaybackWorkspacePane, boolean>>;
  readonly layout: PlaybackWorkspaceLayoutState;
  readonly routeId?: string;
  readonly currentUnitId?: string;
  readonly playheadMs: number;
  readonly focusOwner: PlaybackWorkspaceFocusOwner;
  readonly playbackState: PlaybackWorkspacePlaybackState;
  readonly stale: boolean;
}

const PLAYBACK_WORKSPACE_LAYOUT_BOUNDS = {
  stageWidthPx: { min: 280, max: 760, defaultValue: 520 },
  routeHeightPx: { min: 112, max: 320, defaultValue: 176 },
} as const;

const DEFAULT_PLAYBACK_SESSION: PlaybackSessionState = {
  visible: false,
  panes: {
    canvas: true,
    stage: false,
    route: false,
  },
  layout: {
    stageWidthPx: PLAYBACK_WORKSPACE_LAYOUT_BOUNDS.stageWidthPx.defaultValue,
    routeHeightPx: PLAYBACK_WORKSPACE_LAYOUT_BOUNDS.routeHeightPx.defaultValue,
  },
  playheadMs: 0,
  focusOwner: 'canvas',
  playbackState: 'idle',
  stale: false,
};

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
  playbackSession: PlaybackSessionState;
  revealPlaybackWorkspace: (
    input?: Partial<Pick<PlaybackSessionState, 'routeId' | 'currentUnitId' | 'focusOwner'>>,
  ) => void;
  hidePlaybackWorkspace: () => void;
  setPlaybackPaneVisible: (pane: PlaybackWorkspacePane, visible: boolean) => void;
  setPlaybackSessionRoute: (
    routeId: string | undefined,
    currentUnitId?: string,
    playheadMs?: number,
  ) => void;
  setPlaybackSessionCurrentUnit: (unitId: string | undefined, playheadMs?: number) => void;
  setPlaybackWorkspaceFocusOwner: (focusOwner: PlaybackWorkspaceFocusOwner) => void;
  setPlaybackWorkspacePlaybackState: (playbackState: PlaybackWorkspacePlaybackState) => void;
  setPlaybackWorkspaceLayout: (layout: Partial<PlaybackWorkspaceLayoutState>) => void;
  markPlaybackWorkspaceStale: (stale: boolean) => void;
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
  playbackSession: DEFAULT_PLAYBACK_SESSION,

  revealPlaybackWorkspace: (input = {}) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        visible: true,
        panes: {
          ...prev.playbackSession.panes,
          stage: true,
          route: true,
        },
        ...(input.routeId !== undefined ? { routeId: input.routeId } : {}),
        ...(input.currentUnitId !== undefined ? { currentUnitId: input.currentUnitId } : {}),
        focusOwner: input.focusOwner ?? 'stage',
        stale: false,
        playbackState:
          prev.playbackSession.playbackState === 'stale'
            ? 'idle'
            : prev.playbackSession.playbackState,
      },
    }));
  },

  hidePlaybackWorkspace: () => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        visible: false,
        playbackState:
          prev.playbackSession.playbackState === 'playing'
            ? 'paused'
            : prev.playbackSession.playbackState,
        focusOwner: 'canvas',
      },
    }));
  },

  setPlaybackPaneVisible: (pane, visible) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        panes: {
          ...prev.playbackSession.panes,
          [pane]: visible,
        },
        playbackState:
          pane === 'stage' && !visible && prev.playbackSession.playbackState === 'playing'
            ? 'paused'
            : prev.playbackSession.playbackState,
        focusOwner:
          prev.playbackSession.focusOwner === pane && !visible
            ? 'canvas'
            : prev.playbackSession.focusOwner,
      },
    }));
  },

  setPlaybackSessionRoute: (routeId, currentUnitId, playheadMs = 0) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        ...(routeId !== undefined ? { routeId } : { routeId: undefined }),
        currentUnitId,
        playheadMs,
      },
    }));
  },

  setPlaybackSessionCurrentUnit: (unitId, playheadMs = 0) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        currentUnitId: unitId,
        playheadMs,
      },
    }));
  },

  setPlaybackWorkspaceFocusOwner: (focusOwner) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        focusOwner,
      },
    }));
  },

  setPlaybackWorkspacePlaybackState: (playbackState) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        playbackState,
      },
    }));
  },

  setPlaybackWorkspaceLayout: (layout) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        layout: normalizePlaybackWorkspaceLayout({
          ...prev.playbackSession.layout,
          ...layout,
        }),
      },
    }));
  },

  markPlaybackWorkspaceStale: (stale) => {
    set((prev) => ({
      playbackSession: {
        ...prev.playbackSession,
        stale,
        playbackState: stale ? 'stale' : 'idle',
        ...(stale ? { visible: prev.playbackSession.visible } : {}),
      },
    }));
  },

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

function normalizePlaybackWorkspaceLayout(
  layout: PlaybackWorkspaceLayoutState,
): PlaybackWorkspaceLayoutState {
  return {
    stageWidthPx: clampLayoutValue(
      layout.stageWidthPx,
      PLAYBACK_WORKSPACE_LAYOUT_BOUNDS.stageWidthPx,
    ),
    routeHeightPx: clampLayoutValue(
      layout.routeHeightPx,
      PLAYBACK_WORKSPACE_LAYOUT_BOUNDS.routeHeightPx,
    ),
  };
}

function clampLayoutValue(
  value: number,
  bounds: { readonly min: number; readonly max: number; readonly defaultValue: number },
): number {
  if (!Number.isFinite(value)) return bounds.defaultValue;
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(value)));
}

function withSavedPlayback(
  playbacks: Map<string, NodePlaybackState>,
  assetPath: string,
  state: Omit<NodePlaybackState, 'savedAt'>,
): Map<string, NodePlaybackState> {
  const next = new Map(playbacks);
  next.set(assetPath, { ...state, savedAt: Date.now() });
  return next;
}
