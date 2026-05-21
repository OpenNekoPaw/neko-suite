import {
  createDefaultTempoMap,
  getTempoMapBpm,
  secondsToTicks,
  ticksPerBeat,
  ticksToBarBeat,
  ticksToSeconds,
  type AudioProjectData,
  type BarBeatPosition,
  type TempoMap,
} from '@neko/shared';

export type BeatGridSnapMode = 'off' | 'beat' | 'bar';

export interface BeatGridState {
  enabled: boolean;
  mode: BeatGridSnapMode;
}

export const DEFAULT_BEAT_GRID_STATE: BeatGridState = {
  enabled: true,
  mode: 'beat',
};

export function getProjectTempoMap(projectData: AudioProjectData | null | undefined): TempoMap {
  return projectData?.tempoMap ?? createDefaultTempoMap(projectData?.bpm ?? 120);
}

export function getProjectBpm(projectData: AudioProjectData | null | undefined): number {
  return getTempoMapBpm(projectData?.tempoMap, projectData?.bpm ?? 120);
}

export function formatBarBeatPosition(position: BarBeatPosition): string {
  return `${position.bar}:${position.beat}:${position.tick}`;
}

export function formatSecondsAsBarBeat(seconds: number, tempoMap: TempoMap): string {
  return formatBarBeatPosition(ticksToBarBeat(secondsToTicks(Math.max(0, seconds), tempoMap), tempoMap));
}

export function snapSecondsToGrid(
  seconds: number,
  tempoMap: TempoMap,
  grid: BeatGridState,
): number {
  if (!grid.enabled || grid.mode === 'off') {
    return seconds;
  }

  const currentTicks = secondsToTicks(Math.max(0, seconds), tempoMap);
  const signature = getActiveTimeSignature(tempoMap, currentTicks);
  const beatTicks = ticksPerBeat(tempoMap.ppq, signature.denominator);
  const gridTicks = grid.mode === 'bar' ? beatTicks * signature.numerator : beatTicks;
  if (!Number.isFinite(gridTicks) || gridTicks <= 0) {
    return seconds;
  }

  return ticksToSeconds(Math.round(currentTicks / gridTicks) * gridTicks, tempoMap);
}

function getActiveTimeSignature(tempoMap: TempoMap, ticks: number): TempoMap['timeSignatureEvents'][number] {
  const [firstEvent] = tempoMap.timeSignatureEvents;
  let active = firstEvent ?? { ticks: 0, numerator: 4, denominator: 4 };
  for (const event of tempoMap.timeSignatureEvents) {
    if (event.ticks <= ticks) {
      active = event;
    } else {
      break;
    }
  }
  return active;
}
