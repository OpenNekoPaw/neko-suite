import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AvatarViewer } from './AvatarViewer';
import { useLiveStore } from '../stores/liveStore';

/**
 * 3D viewport for VRM avatar preview.
 * Camera is positioned for upper-body framing (VTuber-style).
 */
export function Viewport3D() {
  const avatarUrl = useLiveStore((s) => s.avatarUrl);

  return (
    <Canvas
      camera={{ position: [0, 1.4, 2], fov: 35, near: 0.1, far: 100 }}
      style={{ background: 'var(--vscode-editor-background, #1e1e1e)' }}
    >
      {/* Soft lighting for character rendering */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 2]} intensity={0.5} />
      <directionalLight position={[-2, 2, -1]} intensity={0.3} />

      <OrbitControls
        target={[0, 1.2, 0]}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={0.5}
        maxDistance={10}
      />

      <Suspense fallback={null}>{avatarUrl && <AvatarViewer url={avatarUrl} />}</Suspense>
    </Canvas>
  );
}
