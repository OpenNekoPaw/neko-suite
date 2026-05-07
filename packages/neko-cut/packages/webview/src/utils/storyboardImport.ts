export interface CutStoryboardImportShot {
  id: string;
  shotNumber: number;
  duration: number;
  imagePath?: string;
  imageDataUrl?: string;
  dialogue?: string;
  voiceOver?: string;
  soundCue?: string;
  label: string;
}

export interface CutStoryboardImportPayload {
  projectName: string;
  shots: readonly CutStoryboardImportShot[];
}

export interface TimelineStoryboardImageClip {
  id: string;
  path: string;
  name: string;
  duration: number;
  startTime: number;
}

export type TimelineStoryboardCueKind = 'dialogue' | 'voiceOver' | 'soundCue';

export interface TimelineStoryboardCue {
  id: string;
  kind: TimelineStoryboardCueKind;
  text: string;
  name: string;
  duration: number;
  startTime: number;
}

export function normalizeCutStoryboardImportPayload(
  value: unknown,
): CutStoryboardImportPayload | null {
  if (!isRecord(value)) return null;
  const projectName = readNonEmptyString(value.projectName) ?? 'Storyboard';
  if (!Array.isArray(value.shots)) return null;

  const shots = value.shots.flatMap((shot, index) => {
    const normalized = normalizeCutStoryboardImportShot(shot, index);
    return normalized ? [normalized] : [];
  });

  return shots.length > 0 ? { projectName, shots } : null;
}

export function buildStoryboardImageClips(
  payload: CutStoryboardImportPayload,
  startTime = 0,
): readonly TimelineStoryboardImageClip[] {
  let cursor = startTime;
  return payload.shots.flatMap((shot) => {
    const path = shot.imagePath ?? shot.imageDataUrl;
    const duration = normalizeDuration(shot.duration);
    const shotStartTime = cursor;
    cursor += duration;
    if (!path) return [];
    const clip: TimelineStoryboardImageClip = {
      id: shot.id,
      path,
      name: shot.label || `Shot ${shot.shotNumber}`,
      duration,
      startTime: shotStartTime,
    };
    return [clip];
  });
}

export function buildStoryboardMetadataCues(
  payload: CutStoryboardImportPayload,
  startTime = 0,
): readonly TimelineStoryboardCue[] {
  let cursor = startTime;
  return payload.shots.flatMap((shot) => {
    const duration = normalizeDuration(shot.duration);
    const cues: TimelineStoryboardCue[] = [];

    if (shot.dialogue) {
      cues.push({
        id: `${shot.id}-dialogue`,
        kind: 'dialogue',
        text: shot.dialogue,
        name: buildCueName('Dialogue', shot),
        duration,
        startTime: cursor,
      });
    }

    if (shot.voiceOver) {
      cues.push({
        id: `${shot.id}-voice-over`,
        kind: 'voiceOver',
        text: shot.voiceOver,
        name: buildCueName('Voice Over', shot),
        duration,
        startTime: cursor,
      });
    }

    if (shot.soundCue) {
      cues.push({
        id: `${shot.id}-sound-cue`,
        kind: 'soundCue',
        text: shot.soundCue,
        name: buildCueName('Sound Cue', shot),
        duration,
        startTime: cursor,
      });
    }

    cursor += duration;
    return cues;
  });
}

function normalizeCutStoryboardImportShot(
  value: unknown,
  index: number,
): CutStoryboardImportShot | null {
  if (!isRecord(value)) return null;
  const id = readNonEmptyString(value.id) ?? `shot-${index + 1}`;
  const shotNumber = readFiniteNumber(value.shotNumber) ?? index + 1;
  const duration = normalizeDuration(readFiniteNumber(value.duration));
  const imagePath = readNonEmptyString(value.imagePath);
  const imageDataUrl = readNonEmptyString(value.imageDataUrl);
  const label = readNonEmptyString(value.label) ?? `#${String(shotNumber).padStart(3, '0')}`;
  const dialogue = readNonEmptyString(value.dialogue);
  const voiceOver = readNonEmptyString(value.voiceOver);
  const soundCue = readNonEmptyString(value.soundCue);

  return {
    id,
    shotNumber,
    duration,
    ...(imagePath ? { imagePath } : {}),
    ...(imageDataUrl ? { imageDataUrl } : {}),
    ...(dialogue ? { dialogue } : {}),
    ...(voiceOver ? { voiceOver } : {}),
    ...(soundCue ? { soundCue } : {}),
    label,
  };
}

function normalizeDuration(value: number | undefined): number {
  return value && value > 0 ? value : 3;
}

function buildCueName(prefix: string, shot: CutStoryboardImportShot): string {
  return `${prefix} ${shot.shotNumber}: ${shot.label}`;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
