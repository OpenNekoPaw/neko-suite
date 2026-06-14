import {
  getAudioEffectParameterMetadata,
  type AudioAutomationCurve,
  type AudioAutomationLane,
  type AutomationPoint,
  type AutomationTarget,
  type AudioTrackMixState,
} from '@neko/shared';

export interface AutomationValueRange {
  min: number;
  max: number;
  defaultValue: number;
  unit?: string;
  label: string;
}

export function getAutomationTargetKey(target: AutomationTarget): string {
  switch (target.kind) {
    case 'track-volume':
      return 'track-volume';
    case 'track-pan':
      return 'track-pan';
    case 'effect-param':
      return `effect-param:${target.effectId}:${target.param}`;
  }
}

export function getAutomationTargetLabel(
  target: AutomationTarget,
  mixState: AudioTrackMixState,
): string {
  switch (target.kind) {
    case 'track-volume':
      return 'Volume';
    case 'track-pan':
      return 'Pan';
    case 'effect-param': {
      const effect = mixState.effectChain.find((candidate) => candidate.id === target.effectId);
      return `${effect?.effectType ?? target.effectId}.${target.param}`;
    }
  }
}

export function getAutomationValueRange(
  target: AutomationTarget,
  mixState: AudioTrackMixState,
): AutomationValueRange | null {
  switch (target.kind) {
    case 'track-volume':
      return { min: 0, max: 2, defaultValue: mixState.volume, label: 'Volume' };
    case 'track-pan':
      return { min: -1, max: 1, defaultValue: mixState.pan, label: 'Pan' };
    case 'effect-param': {
      const effect = mixState.effectChain.find((candidate) => candidate.id === target.effectId);
      if (!effect) return null;
      const metadata = getAudioEffectParameterMetadata(effect.effectType, target.param);
      if (!metadata || !metadata.automatable || metadata.valueKind !== 'number') return null;
      const currentValue = effect.params[target.param];
      return {
        min: metadata.min ?? 0,
        max: metadata.max ?? 1,
        defaultValue: isNumber(currentValue)
          ? currentValue
          : typeof metadata.defaultValue === 'number'
            ? metadata.defaultValue
            : (metadata.min ?? 0),
        unit: metadata.unit,
        label: `${effect.effectType}.${target.param}`,
      };
    }
  }
}

export function createAutomationLane(
  target: AutomationTarget,
  range: AutomationValueRange,
): AudioAutomationLane {
  return {
    id: `automation-${crypto.randomUUID()}`,
    target,
    enabled: true,
    points: [
      {
        ticks: 0,
        value: clampAutomationValue(range.defaultValue, range),
        curve: 'linear',
      },
    ],
  };
}

export function withSortedAutomationPoint(
  points: AutomationPoint[],
  point: AutomationPoint,
): AutomationPoint[] {
  const withoutSameTick = points.filter((candidate) => candidate.ticks !== point.ticks);
  return [...withoutSameTick, point].sort((left, right) => left.ticks - right.ticks);
}

export function updateAutomationPointAt(
  points: AutomationPoint[],
  index: number,
  updates: Partial<AutomationPoint>,
): AutomationPoint[] {
  const next = points.map((point, pointIndex) =>
    pointIndex === index ? { ...point, ...updates } : point,
  );
  return next.sort((left, right) => left.ticks - right.ticks);
}

export function clampAutomationValue(value: number, range: AutomationValueRange): number {
  return Math.max(range.min, Math.min(range.max, value));
}

export function isAutomationCurve(value: string): value is AudioAutomationCurve {
  return value === 'linear' || value === 'hold' || value === 'exponential';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}
