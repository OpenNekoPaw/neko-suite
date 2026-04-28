import React from 'react';
import type { AnimationClip } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { ModelLoader } from './ModelLoader';
import { Viewport3D } from './Viewport3D';

export interface R3FDevelopmentFallbackProps {
  url: string;
  activeAnimation: string | null;
  isPlaying: boolean;
  onAnimationsLoaded: (clips: AnimationClip[]) => void;
  onVRMLoaded: (vrm: VRM | null) => void;
}

export function R3FDevelopmentFallback({
  url,
  activeAnimation,
  isPlaying,
  onAnimationsLoaded,
  onVRMLoaded,
}: R3FDevelopmentFallbackProps): React.JSX.Element {
  return (
    <div className="relative h-full w-full" data-route-a-fallback="development-only">
      <Viewport3D>
        <ModelLoader
          url={url}
          onAnimationsLoaded={onAnimationsLoaded}
          onVRMLoaded={onVRMLoaded}
          activeAnimation={activeAnimation}
          isPlaying={isPlaying}
        />
      </Viewport3D>
      <div className="pointer-events-none absolute right-3 top-3 rounded border border-amber-400/60 bg-black/80 px-2 py-1 text-[11px] text-amber-200">
        Route A unavailable - development fallback
      </div>
    </div>
  );
}
