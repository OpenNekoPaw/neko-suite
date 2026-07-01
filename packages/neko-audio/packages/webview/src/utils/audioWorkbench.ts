import type { AudioProjectData, TimelineElement, TimelineTrack } from '@neko/shared';
import type { LoudnessAnalysisStatus, LoudnessResult, Selection } from '../stores/audioStore';

export type AudioTimelineToolMode =
  'select' | 'split' | 'trim' | 'fade' | 'gain' | 'marker' | 'automation';

export const AUDIO_TIMELINE_TOOL_MODES: readonly AudioTimelineToolMode[] = [
  'select',
  'split',
  'trim',
  'fade',
  'gain',
  'marker',
  'automation',
];

export type AudioInspectorScope = 'selection' | 'clip' | 'track' | 'marker' | 'master';

export type AudioWorkbenchPanel =
  'ai' | 'inspector' | 'effects' | 'markers' | 'recording' | 'export' | 'presets';

export type AudioSelectionTarget =
  | { readonly kind: 'clip'; readonly trackId: string; readonly elementId: string }
  | { readonly kind: 'track'; readonly trackId: string }
  | { readonly kind: 'marker'; readonly markerId: string }
  | { readonly kind: 'region'; readonly start: number; readonly end: number }
  | { readonly kind: 'master' };

export type AudioAiOperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'unsupported';

export type AudioAiResultReviewState =
  'none' | 'previewable' | 'apply-only' | 'unsupported' | 'failed' | 'stale';

export interface AudioAiOperationItem {
  readonly id: string;
  readonly actionId: string;
  readonly label: string;
  readonly target: AudioSelectionTarget | null;
  readonly status: AudioAiOperationStatus;
  readonly createdAt: number;
  readonly affectedTrackIds: readonly string[];
  readonly affectedElementIds: readonly string[];
  readonly affectedEffectIds: readonly string[];
  readonly affectedMarkerIds: readonly string[];
  readonly reviewState: AudioAiResultReviewState;
  readonly diagnostic?: string;
}

export interface AudioResolvedSelection {
  readonly target: AudioSelectionTarget | null;
  readonly track: TimelineTrack | null;
  readonly element: TimelineElement | null;
  readonly marker: AudioProjectData['markers'][number] | null;
  readonly region: Selection | null;
  readonly master: boolean;
  readonly diagnostic?: string;
}

export interface AudioMasterReadiness {
  readonly state: 'ready' | 'needs-analysis' | 'pending' | 'unavailable' | 'clipping';
  readonly loudness: LoudnessResult | null;
  readonly diagnosticKey: string;
}

export function isAudioTimelineToolMode(value: string): value is AudioTimelineToolMode {
  return AUDIO_TIMELINE_TOOL_MODES.includes(value as AudioTimelineToolMode);
}

export function resolveAudioSelection(
  project: AudioProjectData | null,
  target: AudioSelectionTarget | null,
  region: Selection | null,
): AudioResolvedSelection {
  if (!target) {
    return region
      ? {
          target: { kind: 'region', start: region.start, end: region.end },
          track: null,
          element: null,
          marker: null,
          region,
          master: false,
        }
      : {
          target: null,
          track: null,
          element: null,
          marker: null,
          region: null,
          master: false,
          diagnostic: 'audio.workbench.selection.none',
        };
  }

  if (target.kind === 'master') {
    return {
      target,
      track: null,
      element: null,
      marker: null,
      region: null,
      master: true,
    };
  }

  if (target.kind === 'region') {
    return {
      target,
      track: null,
      element: null,
      marker: null,
      region: { start: target.start, end: target.end },
      master: false,
    };
  }

  if (!project) {
    return {
      target,
      track: null,
      element: null,
      marker: null,
      region: null,
      master: false,
      diagnostic: 'audio.workbench.selection.noProject',
    };
  }

  if (target.kind === 'track') {
    const track = project.tracks.find((candidate) => candidate.id === target.trackId) ?? null;
    return {
      target,
      track,
      element: null,
      marker: null,
      region: null,
      master: false,
      ...(track ? {} : { diagnostic: 'audio.workbench.selection.staleTrack' }),
    };
  }

  if (target.kind === 'clip') {
    const track = project.tracks.find((candidate) => candidate.id === target.trackId) ?? null;
    const element = track?.elements.find((candidate) => candidate.id === target.elementId) ?? null;
    return {
      target,
      track,
      element,
      marker: null,
      region: null,
      master: false,
      ...(track && element ? {} : { diagnostic: 'audio.workbench.selection.staleClip' }),
    };
  }

  const marker = project.markers.find((candidate) => candidate.id === target.markerId) ?? null;
  return {
    target,
    track: null,
    element: null,
    marker,
    region: null,
    master: false,
    ...(marker ? {} : { diagnostic: 'audio.workbench.selection.staleMarker' }),
  };
}

export function resolveInspectorScope(
  requestedScope: AudioInspectorScope,
  resolvedSelection: AudioResolvedSelection,
): AudioInspectorScope {
  if (requestedScope !== 'selection') return requestedScope;
  if (resolvedSelection.element) return 'clip';
  if (resolvedSelection.track) return 'track';
  if (resolvedSelection.marker) return 'marker';
  return 'master';
}

export function resolveMasterReadiness(
  loudness: LoudnessResult | null,
  status: LoudnessAnalysisStatus = loudness ? 'available' : 'idle',
): AudioMasterReadiness {
  if (status === 'pending') {
    return {
      state: 'pending',
      loudness,
      diagnosticKey: 'audio.masterReadiness.pending',
    };
  }
  if (status === 'unavailable') {
    return {
      state: 'unavailable',
      loudness: null,
      diagnosticKey: 'audio.masterReadiness.unavailable',
    };
  }
  if (!loudness) {
    return {
      state: 'needs-analysis',
      loudness: null,
      diagnosticKey: 'audio.masterReadiness.needsAnalysis',
    };
  }
  if (loudness.truePeak > -1) {
    return {
      state: 'clipping',
      loudness,
      diagnosticKey: 'audio.masterReadiness.clipping',
    };
  }
  return {
    state: 'ready',
    loudness,
    diagnosticKey: 'audio.masterReadiness.ready',
  };
}

export function rejectRuntimeAudioReference(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.startsWith('blob:') ||
    normalized.startsWith('vscode-webview:') ||
    normalized.startsWith('vscode-webview-resource:') ||
    normalized.includes('/.neko/.cache/') ||
    normalized.includes('\\.neko\\.cache\\') ||
    normalized.startsWith('/tmp/') ||
    normalized.startsWith('/var/folders/')
  );
}
