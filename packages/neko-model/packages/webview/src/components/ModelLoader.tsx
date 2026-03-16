import React, { useEffect, useRef, useMemo, useState, useImperativeHandle } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import type { AnimationClip, Group, Mesh, SkinnedMesh } from 'three';
import { VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { ConsoleLogger, LogLevel } from '@neko/shared';
import { useModelStore } from '../stores/modelStore';
import type { VRMExpressionPreset } from '../types/vrmExpressions';

const logger = new ConsoleLogger('ModelLoader', LogLevel.Info);

interface ModelLoaderProps {
  url: string;
  onAnimationsLoaded?: (clips: AnimationClip[]) => void;
  onVRMLoaded?: (vrm: VRM | null) => void;
  activeAnimation?: string | null;
  isPlaying?: boolean;
}

export interface ModelLoaderHandle {
  applyVRMExpression: (expression: VRMExpressionPreset) => void;
}

/**
 * Loads and renders a glTF/glb/VRM model.
 * Provides animation clips to parent for playback control.
 * Supports VRM expression presets.
 */
export const ModelLoader = React.forwardRef<ModelLoaderHandle, ModelLoaderProps>(
  ({ url, onAnimationsLoaded, onVRMLoaded, activeAnimation, isPlaying = false }, ref) => {
    const groupRef = useRef<Group>(null);
    const { scene, animations } = useGLTF(url);
    const { actions } = useAnimations(animations, groupRef);
    const [vrm, setVrm] = useState<VRM | null>(null);

    // Try to load VRM if the file is .vrm
    useEffect(() => {
      const loadVRM = async () => {
        if (!url.toLowerCase().endsWith('.vrm')) {
          setVrm(null);
          onVRMLoaded?.(null);
          return;
        }

        try {
          const { VRMLoaderPlugin } = await import('@pixiv/three-vrm');
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

          const loader = new GLTFLoader();
          loader.register((parser) => new VRMLoaderPlugin(parser));

          const gltf = await loader.loadAsync(url);
          const loadedVrm = gltf.userData.vrm as VRM | undefined;

          if (loadedVrm) {
            setVrm(loadedVrm);
            onVRMLoaded?.(loadedVrm);
          } else {
            setVrm(null);
            onVRMLoaded?.(null);
          }
        } catch (error) {
          logger.error('Failed to load VRM', error);
          setVrm(null);
          onVRMLoaded?.(null);
        }
      };

      loadVRM();
    }, [url, onVRMLoaded]);

    // Expose VRM expression application method
    useImperativeHandle(ref, () => ({
      applyVRMExpression: (expression: VRMExpressionPreset) => {
        if (!vrm || !vrm.expressionManager) {
          logger.warn('VRM or expressionManager not available');
          return;
        }

        // Reset all expressions first
        const presetNames = Object.values(VRMExpressionPresetName);
        presetNames.forEach((name) => {
          vrm.expressionManager?.setValue(name, 0);
        });

        // Apply the selected expression
        vrm.expressionManager.setValue(expression as VRMExpressionPresetName, 1.0);
      },
    }));

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
    const faceParams = useModelStore((state) => state.faceParams);

    // Morph Target binding: connect face parameters to blend shapes
    useEffect(() => {
      const meshesWithMorphs: Array<{
        mesh: Mesh | SkinnedMesh;
        paramToIndex: Map<string, number>;
      }> = [];

      // Traverse scene to find all meshes with morph targets
      clonedScene.traverse((node: unknown) => {
        if ((node as Mesh).isMesh) {
          const mesh = node as Mesh | SkinnedMesh;
          const morphDict = mesh.morphTargetDictionary;
          const morphInfluences = mesh.morphTargetInfluences;

          if (morphDict && morphInfluences) {
            const paramToIndex = new Map<string, number>();

            // Map face parameter names to morph target indices
            Object.entries(faceParams).forEach(([paramName]) => {
              // Try exact match first
              if (morphDict[paramName] !== undefined) {
                paramToIndex.set(paramName, morphDict[paramName]);
              }
              // Try case-insensitive match
              else {
                const lowerParamName = paramName.toLowerCase();
                const matchingKey = Object.keys(morphDict).find(
                  (key) => key.toLowerCase() === lowerParamName,
                );
                if (matchingKey !== undefined) {
                  const morphIndex = morphDict[matchingKey];
                  if (morphIndex !== undefined) {
                    paramToIndex.set(paramName, morphIndex);
                  }
                }
              }
            });

            if (paramToIndex.size > 0) {
              meshesWithMorphs.push({ mesh, paramToIndex });
            }
          }
        }
      });

      // Update morph target influences when face parameters change
      meshesWithMorphs.forEach(({ mesh, paramToIndex }) => {
        Object.entries(faceParams).forEach(([paramName, value]) => {
          const morphIndex = paramToIndex.get(paramName);
          if (morphIndex !== undefined && mesh.morphTargetInfluences) {
            mesh.morphTargetInfluences[morphIndex] = value;
          }
        });
      });
    }, [clonedScene, faceParams]);

    return (
      <group ref={groupRef}>
        <primitive object={clonedScene} />
      </group>
    );
  },
);
