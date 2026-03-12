import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';

interface Viewport3DProps {
  children?: React.ReactNode;
}

/**
 * Main 3D viewport with orbit controls, grid, and lighting.
 */
export function Viewport3D({ children }: Viewport3DProps): React.JSX.Element {
  return (
    <Canvas
      camera={{ position: [3, 3, 3], fov: 50, near: 0.01, far: 10000 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} castShadow />
      <directionalLight position={[-3, 5, -5]} intensity={0.3} />

      {/* Grid */}
      <Grid
        args={[100, 100]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#444444"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#666666"
        fadeDistance={50}
        infiniteGrid
      />

      {/* Scene content */}
      {children}

      {/* Controls */}
      <OrbitControls makeDefault />

      {/* Orientation gizmo */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport />
      </GizmoHelper>
    </Canvas>
  );
}
