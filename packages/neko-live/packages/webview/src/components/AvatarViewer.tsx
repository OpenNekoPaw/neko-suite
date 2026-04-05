import { useEffect, useRef, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { useLiveStore } from '../stores/liveStore';
import { mapVmcToVrmExpressions } from '../tracking/vmcMapping';

interface AvatarViewerProps {
  url: string;
}

/**
 * Loads a VRM model and drives it from real-time tracking data.
 * Runs expression/bone updates every frame in the R3F render loop.
 */
export function AvatarViewer({ url }: AvatarViewerProps) {
  const groupRef = useRef<Group>(null);
  const [vrm, setVrm] = useState<VRM | null>(null);
  const setAvatarLoaded = useLiveStore((s) => s.setAvatarLoaded);

  // Load VRM model
  useEffect(() => {
    let cancelled = false;

    const loadVrm = async () => {
      try {
        const { VRMLoaderPlugin } = await import('@pixiv/three-vrm');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));

        const gltf = await loader.loadAsync(url);
        if (cancelled) return;

        const loadedVrm = gltf.userData.vrm as VRM | undefined;
        if (loadedVrm) {
          // Rotate model to face camera (VRM default faces +Z)
          loadedVrm.scene.rotation.y = Math.PI;
          setVrm(loadedVrm);
          setAvatarLoaded(true);
        }
      } catch (err) {
        console.error('[AvatarViewer] Failed to load VRM:', err);
        setAvatarLoaded(false);
      }
    };

    loadVrm();
    return () => {
      cancelled = true;
    };
  }, [url, setAvatarLoaded]);

  // Drive avatar from tracking data every frame
  const applyTracking = useCallback((vrm: VRM) => {
    const data = useLiveStore.getState().currentTrackingData;
    if (!data) return;

    // Apply blend shapes → VRM expressions
    if (data.blendShapes && Object.keys(data.blendShapes).length > 0) {
      const expressions = mapVmcToVrmExpressions(data.blendShapes);

      for (const [name, value] of Object.entries(expressions)) {
        vrm.expressionManager?.setValue(name, value);
      }
    }

    // Apply head rotation from tracking
    if (data.headRotation) {
      const headNode = vrm.humanoid?.getNormalizedBoneNode('head');
      if (headNode) {
        const [x, y, z, w] = data.headRotation;
        headNode.quaternion.set(x, y, z, w);
      }
    }

    // Apply other bone transforms
    if (data.boneTransforms) {
      for (const [boneName, transform] of Object.entries(data.boneTransforms)) {
        if (boneName === 'Head') continue; // Already handled above
        const node = vrm.humanoid?.getNormalizedBoneNode(boneName as never);
        if (node) {
          const [rx, ry, rz, rw] = transform.rotation;
          node.quaternion.set(rx, ry, rz, rw);
        }
      }
    }
  }, []);

  // R3F render loop
  useFrame((_, delta) => {
    if (!vrm) return;

    applyTracking(vrm);
    vrm.update(delta);
  });

  if (!vrm) {
    return null;
  }

  return (
    <group ref={groupRef}>
      <primitive object={vrm.scene} />
    </group>
  );
}
