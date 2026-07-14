import { create } from 'zustand';
import type {
  TrackingData,
  TrackingMode,
  AvatarType,
  PuppetDelta,
  PuppetParameter,
  RecordingState,
  LiveDeviceBinding,
  LiveDeviceRole,
} from '../types/tracking';

export interface LiveState {
  // ─── Tracking ─────────────────────────────────────────────────────────
  trackingMode: TrackingMode;
  isTracking: boolean;
  trackingFps: number;
  currentTrackingData: TrackingData | null;

  // ─── Avatar ───────────────────────────────────────────────────────────
  avatarUrl: string | null;
  avatarType: AvatarType;
  isAvatarLoaded: boolean;

  // ─── Puppet ───────────────────────────────────────────────────────────
  puppetParameters: PuppetParameter[];
  currentPuppetDelta: PuppetDelta | null;

  // ─── Recording ────────────────────────────────────────────────────────
  recordingState: RecordingState;
  recordingElapsedMs: number;
  lastRecordingPath: string | null;
  lastRecordingRetained: boolean;
  deviceBindings: Partial<Record<LiveDeviceRole, LiveDeviceBinding>>;

  // ─── UI ───────────────────────────────────────────────────────────────
  showSkeletonOverlay: boolean;

  // ─── Actions ──────────────────────────────────────────────────────────
  setTrackingMode: (mode: TrackingMode) => void;
  setIsTracking: (active: boolean) => void;
  applyTrackingData: (data: TrackingData) => void;
  setAvatarUrl: (url: string | null, type: AvatarType) => void;
  setAvatarLoaded: (loaded: boolean) => void;
  setPuppetParameters: (params: PuppetParameter[]) => void;
  applyPuppetDelta: (delta: PuppetDelta) => void;
  setRecordingState: (state: RecordingState) => void;
  setRecordingElapsed: (ms: number) => void;
  setLastRecordingPath: (path: string | null) => void;
  setLastRecordingRetained: (retained: boolean) => void;
  setDeviceBinding: (role: LiveDeviceRole, binding?: LiveDeviceBinding) => void;
  toggleSkeletonOverlay: () => void;

  // Recording handlers (set by App, called by TrackingPanel)
  onStartRecording?: (includeAudio: boolean) => void;
  onStopRecording?: () => void;
}

const FPS_WINDOW_MS = 1000;

export const useLiveStore = create<LiveState>((set) => {
  const frameTimestamps: number[] = [];

  return {
    trackingMode: 'vmc',
    isTracking: false,
    trackingFps: 0,
    currentTrackingData: null,

    avatarUrl: null,
    avatarType: 'vrm',
    isAvatarLoaded: false,

    puppetParameters: [],
    currentPuppetDelta: null,

    recordingState: 'idle',
    recordingElapsedMs: 0,
    lastRecordingPath: null,
    lastRecordingRetained: false,
    deviceBindings: {},

    showSkeletonOverlay: false,

    setTrackingMode: (mode) => set({ trackingMode: mode }),
    setIsTracking: (active) => {
      if (!active) {
        frameTimestamps.length = 0;
      }
      set({ isTracking: active, trackingFps: 0 });
    },

    applyTrackingData: (data) => {
      const now = performance.now();
      frameTimestamps.push(now);

      const cutoff = now - FPS_WINDOW_MS;
      while (frameTimestamps.length > 0 && frameTimestamps[0]! < cutoff) {
        frameTimestamps.shift();
      }

      set({
        currentTrackingData: data,
        trackingFps: frameTimestamps.length,
      });
    },

    setAvatarUrl: (url, type) => set({ avatarUrl: url, avatarType: type, isAvatarLoaded: false }),
    setAvatarLoaded: (loaded) => set({ isAvatarLoaded: loaded }),
    setPuppetParameters: (params) => set({ puppetParameters: params }),
    applyPuppetDelta: (delta) => set({ currentPuppetDelta: delta }),
    setRecordingState: (state) => set({ recordingState: state }),
    setRecordingElapsed: (ms) => set({ recordingElapsedMs: ms }),
    setLastRecordingPath: (path) => set({ lastRecordingPath: path }),
    setLastRecordingRetained: (retained) => set({ lastRecordingRetained: retained }),
    setDeviceBinding: (role, binding) =>
      set((state) => {
        const deviceBindings = { ...state.deviceBindings };
        if (binding) {
          deviceBindings[role] = binding;
        } else {
          delete deviceBindings[role];
        }
        return { deviceBindings };
      }),
    toggleSkeletonOverlay: () => set((s) => ({ showSkeletonOverlay: !s.showSkeletonOverlay })),
  };
});
