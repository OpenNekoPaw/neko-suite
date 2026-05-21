/**
 * Audio Editor Zustand Store
 *
 * Central state management for the audio editor.
 * Organized into logical slices: file, playback, selection, ui.
 */

import { create } from 'zustand';
import type { AudioInfo, WaveformData } from '../shared/types';
import { DEFAULT_BEAT_GRID_STATE, type BeatGridSnapMode, type BeatGridState } from '../utils/beatGrid';

// =============================================================================
// State Types
// =============================================================================

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export interface Selection {
  start: number;
  end: number;
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color?: string;
}

export type SidePanelType = 'effects' | 'recording' | 'export' | 'presets';

export interface AudioStoreState {
  // File info
  filePath: string | null;
  fileName: string | null;
  audioInfo: AudioInfo | null;
  waveform: WaveformData | null;

  // Playback
  playbackState: PlaybackState;
  currentTime: number;
  volume: number;
  speed: number;
  isMuted: boolean;
  streamId: string | null;
  streamUrl: string | null;

  // Selection
  selection: Selection | null;

  // UI
  showSpectrum: boolean;
  activeSidePanel: SidePanelType | null;
  isLoading: boolean;
  error: string | null;
  /** Timeline zoom level (independent from playback speed) */
  zoom: number;
  /** Beat-grid snapping state for project timeline editing */
  beatGrid: BeatGridState;

  // Loop
  isLooping: boolean;

  // Project mode (.nka)
  projectMode: boolean;
  markers: Marker[];

  // Silence regions (from analysis)
  silenceRegions: Array<{ start: number; end: number }>;

  // Loudness analysis result
  loudness: LoudnessResult | null;

  // Toast notifications
  toast: ToastMessage | null;
}

export interface LoudnessResult {
  integratedLoudness: number;
  truePeak: number;
  loudnessRange: number;
}

export interface ToastMessage {
  id: number;
  text: string;
  level: 'info' | 'success' | 'error';
}

// =============================================================================
// Actions
// =============================================================================

export interface AudioStoreActions {
  // File
  setFileInfo(filePath: string | null, fileName: string, audioInfo: AudioInfo | null): void;
  setWaveform(waveform: WaveformData): void;

  // Playback
  setPlaybackState(state: PlaybackState): void;
  setCurrentTime(time: number): void;
  setVolume(volume: number): void;
  setSpeed(speed: number): void;
  toggleMute(): void;
  setStreamInfo(streamId: string, streamUrl: string): void;
  clearStreamInfo(): void;

  // Selection
  setSelection(selection: Selection | null): void;

  // UI
  toggleSpectrum(): void;
  toggleSidePanel(panel: SidePanelType): void;
  closeSidePanel(): void;
  setLoading(loading: boolean): void;
  setError(error: string | null): void;
  setZoom(zoom: number): void;
  setBeatGrid: (updates: Partial<BeatGridState>) => void;
  setBeatGridSnapMode: (mode: BeatGridSnapMode) => void;
  toggleLoop(): void;

  // Project
  setProjectMode(mode: boolean): void;
  setMarkers(markers: Marker[]): void;
  addMarker(marker: Marker): void;
  removeMarker(id: string): void;

  // Analysis
  setSilenceRegions(regions: Array<{ start: number; end: number }>): void;
  setLoudness(loudness: LoudnessResult | null): void;

  // Toast
  showToast(text: string, level?: 'info' | 'success' | 'error'): void;
  clearToast(): void;

  // Reset
  reset(): void;
}

// =============================================================================
// Store
// =============================================================================

const initialState: AudioStoreState = {
  filePath: null,
  fileName: null,
  audioInfo: null,
  waveform: null,

  playbackState: 'stopped',
  currentTime: 0,
  volume: 1.0,
  speed: 1.0,
  isMuted: false,
  streamId: null,
  streamUrl: null,

  selection: null,

  showSpectrum: false,
  activeSidePanel: null,
  isLoading: true,
  error: null,
  zoom: 1.0,
  beatGrid: DEFAULT_BEAT_GRID_STATE,

  isLooping: false,

  projectMode: false,
  markers: [],

  silenceRegions: [],

  loudness: null,
  toast: null,
};

export const useAudioStore = create<AudioStoreState & AudioStoreActions>()((set) => ({
  ...initialState,

  // File
  setFileInfo: (filePath, fileName, audioInfo) =>
    set({ filePath, fileName, audioInfo, isLoading: false, error: null }),
  setWaveform: (waveform) => set({ waveform }),

  // Playback
  setPlaybackState: (playbackState) => set({ playbackState }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setVolume: (volume) => set({ volume }),
  setSpeed: (speed) => set({ speed }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  setStreamInfo: (streamId, streamUrl) => set({ streamId, streamUrl }),
  clearStreamInfo: () => set({ streamId: null, streamUrl: null }),

  // Selection
  setSelection: (selection) => set({ selection }),

  // UI
  toggleSpectrum: () => set((s) => ({ showSpectrum: !s.showSpectrum })),
  toggleSidePanel: (panel) =>
    set((s) => ({ activeSidePanel: s.activeSidePanel === panel ? null : panel })),
  closeSidePanel: () => set({ activeSidePanel: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
  setBeatGrid: (updates) =>
    set((s) => ({ beatGrid: { ...s.beatGrid, ...updates } })),
  setBeatGridSnapMode: (mode) =>
    set((s) => ({ beatGrid: { ...s.beatGrid, enabled: mode !== 'off', mode } })),
  toggleLoop: () => set((s) => ({ isLooping: !s.isLooping })),

  // Project
  setProjectMode: (projectMode) => set({ projectMode }),
  setMarkers: (markers) => set({ markers }),
  addMarker: (marker) => set((s) => ({ markers: [...s.markers, marker] })),
  removeMarker: (id) => set((s) => ({ markers: s.markers.filter((m) => m.id !== id) })),

  // Analysis
  setSilenceRegions: (silenceRegions) => set({ silenceRegions }),
  setLoudness: (loudness) => set({ loudness }),

  // Toast
  showToast: (text, level = 'info') => {
    const id = Date.now();
    set({ toast: { id, text, level } });
    // Auto-clear after 4 seconds
    setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : {}));
    }, 4000);
  },
  clearToast: () => set({ toast: null }),

  // Reset
  reset: () => set(initialState),
}));
