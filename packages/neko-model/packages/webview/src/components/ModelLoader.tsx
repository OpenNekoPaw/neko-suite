import React, { useEffect, useRef, useMemo } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import type { AnimationClip, Group } from 'three';

interface ModelLoaderProps {
  url: string;
  onAnimationsLoaded?: (clips: AnimationClip[]) => void;
  activeAnimation?: string | null;
  isPlaying?: boolean;
}

/**
 * Loads and renders a glTF/glb model.
 * Provides animation clips to parent for playback control.
 */
export function ModelLoader({
  url,
  onAnimationsLoaded,
  activeAnimation,
  isPlaying = false,
}: ModelLoaderProps): React.JSX.Element {
  const groupRef = useRef<Group>(null);
  const { scene, animations } = useGLTF(url);
  const { actions } = useAnimations(animations, groupRef);

  // Report animations to parent
  useEffect(() => {
    if (animations.length > 0) {
      onAnimationsLoaded?.(animations);
    }
  }, [animations, onAnimationsLoaded]);

  // Handle animation playback
  useEffect(() => {
    if (!activeAnimation || !actions) return;

    // Stop all current actions
    Object.values(actions).forEach((action) => action?.stop());

    const action = actions[activeAnimation];
    if (!action) return;

    if (isPlaying) {
      action.reset().play();
    } else {
      action.reset().play();
      action.paused = true;
    }
  }, [activeAnimation, isPlaying, actions]);

  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  return (
    <group ref={groupRef}>
      <primitive object={clonedScene} />
    </group>
  );
}
