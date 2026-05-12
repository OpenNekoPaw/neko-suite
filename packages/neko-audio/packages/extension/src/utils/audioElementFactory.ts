import * as path from 'path';
import type { AudioElement } from '@neko/shared';
import { DEFAULT_SPEED_PROPERTIES, ENGINE_DEFAULT_TRANSFORM, generateId } from '@neko/shared';

export interface CreateDefaultAudioElementOptions {
  id?: string;
  filePath: string;
  duration: number;
}

export function createDefaultAudioElement({
  id,
  filePath,
  duration,
}: CreateDefaultAudioElementOptions): AudioElement {
  return {
    id: id ?? generateId(),
    type: 'audio',
    name: path.basename(filePath),
    src: filePath,
    duration,
    startTime: 0,
    trimStart: 0,
    trimEnd: 0,
    transform: { ...ENGINE_DEFAULT_TRANSFORM },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    speed: { ...DEFAULT_SPEED_PROPERTIES },
  };
}
