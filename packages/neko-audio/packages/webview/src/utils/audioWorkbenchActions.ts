import {
  DEFAULT_AUDIO_PROPERTIES,
  type AudioProjectData,
  type TimelineElement,
} from '@neko/shared';
import { postMessage } from '../shared/useVscodeMessage';
import type {
  AudioAiResultReviewState,
  AudioSelectionTarget,
  AudioResolvedSelection,
} from './audioWorkbench';

export type AudioWorkbenchActionId =
  | 'split'
  | 'trim'
  | 'fadeIn'
  | 'fadeOut'
  | 'gain'
  | 'denoise'
  | 'normalize'
  | 'silenceCleanup'
  | 'sendToAi';

export type AudioWorkbenchActionTargetKind = 'clip' | 'region' | 'track' | 'master';

export interface AudioWorkbenchActionAvailability {
  readonly enabled: boolean;
  readonly reasonKey?: string;
}

export interface AudioWorkbenchActionDefinition {
  readonly id: AudioWorkbenchActionId;
  readonly labelKey: string;
  readonly icon: string;
  readonly targetKinds: readonly AudioWorkbenchActionTargetKind[];
  readonly aiAssisted?: boolean;
  readonly evaluate: (input: AudioWorkbenchActionInput) => AudioWorkbenchActionAvailability;
  readonly run: (input: AudioWorkbenchActionInput) => AudioWorkbenchActionRunResult;
}

export interface AudioWorkbenchActionInput {
  readonly project: AudioProjectData | null;
  readonly selection: AudioResolvedSelection;
  readonly currentTime: number;
  readonly updateElement: (
    trackId: string,
    elementId: string,
    updates: Partial<TimelineElement>,
  ) => void;
  readonly splitElementAt: (trackId: string, elementId: string, time: number) => void;
  readonly showToast?: (text: string, level?: 'info' | 'success' | 'error') => void;
}

export type AudioWorkbenchActionRunResult =
  | {
      readonly ok: true;
      readonly reviewState?: Exclude<AudioAiResultReviewState, 'failed' | 'stale'>;
    }
  | { readonly ok: false; readonly reasonKey: string };

function requiresClip(input: AudioWorkbenchActionInput): AudioWorkbenchActionAvailability {
  if (input.selection.element && input.selection.track) return { enabled: true };
  const reasonKey =
    input.selection.diagnostic && input.selection.diagnostic !== 'audio.workbench.selection.none'
      ? input.selection.diagnostic
      : 'audio.workbench.selection.clipRequired';
  return { enabled: false, reasonKey };
}

function requiresClipOrRegion(input: AudioWorkbenchActionInput): AudioWorkbenchActionAvailability {
  if (input.selection.element || input.selection.region) return { enabled: true };
  const reasonKey =
    input.selection.diagnostic && input.selection.diagnostic !== 'audio.workbench.selection.none'
      ? input.selection.diagnostic
      : 'audio.workbench.selection.clipOrRegionRequired';
  return { enabled: false, reasonKey };
}

function runClipUpdate(
  input: AudioWorkbenchActionInput,
  updates: Partial<TimelineElement>,
): AudioWorkbenchActionRunResult {
  const { track, element } = input.selection;
  if (!track || !element) return { ok: false, reasonKey: 'audio.workbench.selection.clipRequired' };
  input.updateElement(track.id, element.id, updates);
  return { ok: true, reviewState: 'apply-only' };
}

function getClipEnd(element: TimelineElement): number {
  return element.startTime + element.duration;
}

export const AUDIO_WORKBENCH_ACTIONS: readonly AudioWorkbenchActionDefinition[] = [
  {
    id: 'split',
    labelKey: 'audio.workbench.actions.split',
    icon: '|',
    targetKinds: ['clip'],
    evaluate(input) {
      const availability = requiresClip(input);
      if (!availability.enabled) return availability;
      const element = input.selection.element!;
      const canSplit =
        input.currentTime > element.startTime + 0.01 &&
        input.currentTime < getClipEnd(element) - 0.01;
      return canSplit
        ? { enabled: true }
        : { enabled: false, reasonKey: 'audio.workbench.actions.split.playheadOutsideClip' };
    },
    run(input) {
      const availability = this.evaluate(input);
      if (!availability.enabled)
        return {
          ok: false,
          reasonKey: availability.reasonKey ?? 'audio.workbench.actions.unavailable',
        };
      input.splitElementAt(
        input.selection.track!.id,
        input.selection.element!.id,
        input.currentTime,
      );
      return { ok: true, reviewState: 'apply-only' };
    },
  },
  {
    id: 'trim',
    labelKey: 'audio.workbench.actions.trim',
    icon: '[',
    targetKinds: ['clip', 'region'],
    evaluate: requiresClipOrRegion,
    run(input) {
      if (input.selection.element && input.selection.track) {
        return runClipUpdate(input, { trimStart: input.selection.element.trimStart });
      }
      if (input.selection.region) {
        postMessage({
          type: 'audio:trim',
          startTime: input.selection.region.start,
          endTime: input.selection.region.end,
          mode: 'project',
        });
        return { ok: true, reviewState: 'apply-only' };
      }
      return { ok: false, reasonKey: 'audio.workbench.selection.clipOrRegionRequired' };
    },
  },
  {
    id: 'fadeIn',
    labelKey: 'audio.workbench.actions.fadeIn',
    icon: '/',
    targetKinds: ['clip'],
    evaluate: requiresClip,
    run(input) {
      const element = input.selection.element;
      const fadeIn = Math.min(1, Math.max(0, (element?.duration ?? 1) / 4));
      return runClipUpdate(input, {
        audio: { ...DEFAULT_AUDIO_PROPERTIES, ...(element?.audio ?? {}), fadeIn },
      });
    },
  },
  {
    id: 'fadeOut',
    labelKey: 'audio.workbench.actions.fadeOut',
    icon: '\\',
    targetKinds: ['clip'],
    evaluate: requiresClip,
    run(input) {
      const element = input.selection.element;
      const fadeOut = Math.min(1, Math.max(0, (element?.duration ?? 1) / 4));
      return runClipUpdate(input, {
        audio: { ...DEFAULT_AUDIO_PROPERTIES, ...(element?.audio ?? {}), fadeOut },
      });
    },
  },
  {
    id: 'gain',
    labelKey: 'audio.workbench.actions.gain',
    icon: '+',
    targetKinds: ['clip'],
    evaluate: requiresClip,
    run(input) {
      const element = input.selection.element;
      return runClipUpdate(input, {
        audio: { ...DEFAULT_AUDIO_PROPERTIES, ...(element?.audio ?? {}), gain: 0 },
      });
    },
  },
  {
    id: 'denoise',
    labelKey: 'audio.workbench.actions.denoise',
    icon: 'N',
    targetKinds: ['clip', 'region', 'track', 'master'],
    aiAssisted: true,
    evaluate: requiresClipOrRegion,
    run(input) {
      const availability = requiresClipOrRegion(input);
      if (!availability.enabled)
        return {
          ok: false,
          reasonKey: availability.reasonKey ?? 'audio.workbench.selection.clipOrRegionRequired',
        };
      postMessage({
        type: 'audio:effects',
        effects: [
          {
            id: crypto.randomUUID(),
            effectType: 'noise-gate',
            enabled: true,
            params: { threshold: -40, attack: 1, hold: 50, release: 100 },
          },
        ],
      });
      return { ok: true, reviewState: 'apply-only' };
    },
  },
  {
    id: 'normalize',
    labelKey: 'audio.workbench.actions.normalize',
    icon: '=',
    targetKinds: ['clip', 'region', 'master'],
    aiAssisted: true,
    evaluate: requiresClipOrRegion,
    run(input) {
      const availability = requiresClipOrRegion(input);
      if (!availability.enabled)
        return {
          ok: false,
          reasonKey: availability.reasonKey ?? 'audio.workbench.selection.clipOrRegionRequired',
        };
      postMessage({
        type: 'audio:effects',
        effects: [
          {
            id: crypto.randomUUID(),
            effectType: 'gain',
            enabled: true,
            params: { gainDb: 0 },
          },
        ],
      });
      return { ok: true, reviewState: 'apply-only' };
    },
  },
  {
    id: 'silenceCleanup',
    labelKey: 'audio.workbench.actions.silenceCleanup',
    icon: '_',
    targetKinds: ['region', 'master'],
    aiAssisted: true,
    evaluate(input) {
      return input.selection.region || input.project
        ? { enabled: true }
        : { enabled: false, reasonKey: 'audio.workbench.selection.noProject' };
    },
    run() {
      postMessage({ type: 'audio:analyze', kind: 'silence' });
      return { ok: true, reviewState: 'apply-only' };
    },
  },
  {
    id: 'sendToAi',
    labelKey: 'audio.workbench.actions.sendToAi',
    icon: 'AI',
    targetKinds: ['clip', 'region', 'track', 'master'],
    aiAssisted: true,
    evaluate(input) {
      return input.selection.target || input.selection.region
        ? { enabled: true }
        : { enabled: false, reasonKey: 'audio.workbench.selection.none' };
    },
    run() {
      return { ok: true, reviewState: 'unsupported' };
    },
  },
];

export function getAudioWorkbenchAction(
  actionId: AudioWorkbenchActionId,
): AudioWorkbenchActionDefinition {
  const action = AUDIO_WORKBENCH_ACTIONS.find((candidate) => candidate.id === actionId);
  if (!action) {
    throw new Error(`Unknown audio workbench action: ${actionId}`);
  }
  return action;
}

export function describeAudioSelectionTarget(target: AudioSelectionTarget | null): string {
  if (!target) return 'none';
  switch (target.kind) {
    case 'clip':
      return `${target.trackId}:${target.elementId}`;
    case 'track':
      return target.trackId;
    case 'marker':
      return target.markerId;
    case 'region':
      return `${target.start.toFixed(2)}-${target.end.toFixed(2)}`;
    case 'master':
      return 'master';
  }
}
