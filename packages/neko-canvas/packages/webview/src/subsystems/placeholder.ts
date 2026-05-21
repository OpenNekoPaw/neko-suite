import type { CanvasSubsystemId } from '@neko/shared';
import { getBuiltInCanvasSubsystemManifest } from '@neko/shared';
import type { WebviewSubsystemRegistration } from './types';

export function createPlaceholderSubsystemRegistration(
  id: CanvasSubsystemId,
): WebviewSubsystemRegistration {
  const manifest = getBuiltInCanvasSubsystemManifest(id);

  if (!manifest) {
    throw new Error(`Missing built-in ${id} Canvas subsystem manifest`);
  }

  return {
    manifest,
  };
}
