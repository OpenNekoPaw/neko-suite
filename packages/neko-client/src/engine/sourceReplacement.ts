import type { TimelineSourceReplacement } from './types';

export interface TimelineSourcePatch {
  src: string;
  resourceId?: string;
}

export function sourceReplacementToElementPatch(
  replacement: TimelineSourceReplacement,
): TimelineSourcePatch {
  return {
    src: replacement.src,
    ...(replacement.resourceId ? { resourceId: replacement.resourceId } : {}),
  };
}
