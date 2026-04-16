# Cloth Simulation & Surface Materials Architecture

> Related: [neko-engine-architecture.md](./neko-engine-architecture.md) | [product-evolution-roadmap.md](./product-evolution-roadmap.md)

## Summary

Cloth simulation and surface textures are **properties of assets, not independent assets**. They belong inline in CharacterBundle (.nkchar) and SceneSpec (.nkscene). No new nk* format is needed — texture files themselves use standard formats (PNG/EXR/KTX2).

---

## Cloth Simulation

### Stage-by-Stage Requirements

```
Stage 1 (Video)         — Low: character garment motion, static frame acceptable
Stage 3 (Interactive)   — Medium: real-time garment response to motion, 30fps sufficient
Stage 4 (Game)          — High: player interaction triggers physics response
Stage 5 (Simulation)    — Very high: precise physics, export to external solvers
```

Stages 1–3 are the current target. AAA-level cloth simulation is not needed.

### Approach A: Skeleton-Based Pseudo-Cloth (Current Recommendation, P1)

VRM Spring Bone is the lightweight substitute for cloth simulation. Community character files already include these configurations — the engine only needs to drive them in the runtime-scene tick.

```rust
// runtime-scene/src/spring_bone.rs
pub struct SpringBoneChain {
    pub bones: Vec<Entity>,
    pub stiffness: f32,    // spring stiffness
    pub gravity: Vec3,     // gravity direction
    pub drag: f32,         // damping
    pub hit_radius: f32,   // collision sphere radius
}

fn spring_bone_tick(
    mut chains: Query<&mut SpringBoneChain>,
    mut transforms: Query<&mut Transform>,
    time: Res<Time>,
) {
    // Position-based dynamics — no Rapier needed
}
```

**Integration point**: Extend existing VRM parsing in runtime-scene. No new physics libraries required.

**Stage 3 narrative integration**: Cloth parameters respond to character emotion:

```typescript
// AIEditResult.operations — cloth state as narrative signal
{ type: 'update-cloth-params', stiffness: 0.3, gravity: [0, -2.0, 0] }
```

### Approach B: Position-Based Dynamics (PBD, P2 — Stage 4+)

```
Advantages: unconditionally stable, GPU-friendly, runs in compute shader
Data flow:
  Mesh vertices (GPU buffer)
  → Cloth Solve Pass (compute shader, 4–8 iterations)
  → Updated vertices
  → Normal GPU Skinning → Render
```

```wgsl
// engine-kernel/src/shaders/cloth_solve.wgsl
@compute @workgroup_size(64)
fn cloth_solve(@builtin(global_invocation_id) id: vec3<u32>) {
    // Distance constraints
    // Bend constraints
    // Collision constraints (sphere/capsule)
    // Wind force
}
```

### Approach C: Rapier Physics

Rapier (currently used in runtime-game) **does not support cloth** — only rigid bodies, joints, and fluids. Cloth requires PBD or FEM independently.

### ClothQuality in RenderProfile

```typescript
interface ClothQuality {
  mode: 'spring-bone' | 'pbd' | 'external-solver';
  iterations: number;   // PBD iteration count
  substeps: number;     // sub-steps per frame
  wind: Vec3;           // global wind force
  gravity: Vec3;
}

// Per-profile defaults:
// Video Profile     → spring-bone (offline, more iterations, higher quality)
// Interactive       → spring-bone (real-time, capped iterations)
// Game Profile      → pbd (GPU parallel)
// Simulation        → external-solver (Houdini Vellum / Marvelous Designer)
```

---

## Surface Textures

### Four-Layer Texture Architecture

```
Layer 1 — Albedo/Diffuse       Base color
Layer 2 — Normal Map           Surface detail without extra geometry
Layer 3 — PBR params           Metallic / Roughness / Ambient Occlusion
Layer 4 — Special channels     Emission / Subsurface / Custom NPR params
```

### Per-RenderProfile Usage

| Profile     | Albedo           | Normal | PBR      | Special              |
|-------------|------------------|--------|----------|----------------------|
| Video       | Full resolution  | ✅     | Full     | Emission + Subsurface |
| Interactive | ✅               | ✅     | Reduced  | Emission             |
| XR          | Compressed       | ✅     | ✅       | —                    |
| Game        | Mipmap           | ✅     | ✅       | Custom NPR           |
| Web         | Downscaled       | Optional | —      | —                    |
| Simulation  | ✅               | —      | —        | Physics param maps   |

### 2D Character Normal Map Lighting (Stage 3 Differentiator)

Live2D / Spine characters are 2D but can use normal maps to simulate 3D lighting, enabling dynamic lighting for interactive cinema:

```
2D character skin texture + Normal Map
  → wgpu fragment shader computes lighting
  → Dynamic light source position driven by character emotion / scene atmosphere
  → Output: 2D character with realistic light/shadow — Stage 3 interactive cinema
```

**Existing capability**: engine-kernel already supports custom WGSL shaders.
**To implement**: PuppetElement normal map channel + 2D lighting fragment shader.

### Asset Format Placement

Textures are **inline properties** of CharacterBundle and SceneSpec — not independent assets:

```jsonc
// CharacterBundle (.nkchar)
{
  "textures": {
    "albedo": "./skin_albedo.png",
    "normal": "./skin_normal.png",
    "roughness": "./skin_roughness.png",
    "custom": {
      "rimLight": "./rim.png",
      "subsurface": "./sss.png"
    }
  },
  "materialOverrides": {        // runtime overrides, does not modify source file
    "roughness": 0.4,
    "subsurfaceScatter": 0.2
  }
}

// SceneSpec (.nkscene)
{
  "terrain": {
    "textures": {
      "albedo": "./ground_albedo.png",
      "normal": "./ground_normal.png",
      "displacement": "./ground_height.png"   // Stage 4+
    }
  },
  "atmosphere": {
    "skybox": "./hdri_sunset.exr"             // HDR standard format
  }
}
```

**No new nk* format needed.** Texture files use standard formats (PNG/EXR/KTX2). Metadata is inline in .nkchar/.nkscene.

### Procedural Textures

Reduces asset size, supports dynamic changes, AI-driven:

```rust
enum ProceduralTexture {
    Noise { scale: f32, octaves: u32 },
    Voronoi { scale: f32, randomness: f32 },
    Gradient { from: Vec4, to: Vec4, angle: f32 },
    Checkerboard { size: f32 },
}
```

AI can update procedural texture parameters via AIEditResult:

```typescript
// Stage 3 narrative-driven style change
{ type: 'update-material', targetId: 'scene:ground',
  params: { procedural: { type: 'noise', scale: 2.0 }, roughness: 0.9 } }
```

### Texture Compression and Streaming (P3)

```
Platform-aware format:
  Desktop  → BC7 (DirectX) / ASTC (Apple Silicon)
  Web/XR   → ASTC or KTX2 (Basis Universal transcoding)
  Export   → PNG/EXR (lossless, final delivery)

Streaming (large scenes):
  wgpu texture streaming → LOD-based mipmap loading by view distance
  SceneSpec region field: texture_lod_bias
```

---

## Format Decision: No New nk* Format

| Question | Answer |
|----------|--------|
| Do cloth params need a standalone format? | No — they depend on character skeleton; meaningless without a host asset |
| Do material/texture params need a standalone format? | No — inline in .nkchar/.nkscene; texture files themselves use PNG/EXR/KTX2 |
| When would a .nkmaterial format be warranted? | Only if cross-asset material preset library is needed (P3, deferred) |

**Principle**: Formats are for assets with independent lifecycle. Properties of an asset are inline data.

---

## Implementation Priority

| Priority | Item | Stage | Notes |
|----------|------|-------|-------|
| **P1** | VRM Spring Bone cloth | 1–3 | Extends existing VRM parsing, no new lib |
| **P1** | 2D Normal Map lighting | 3 | PuppetElement + WGSL shader |
| **P1** | PBR material system (CharacterBundle.textures) | 1–3 | Types + materialOverrides |
| **P2** | PBD cloth compute shader | 4 | wgpu compute pass |
| **P2** | Procedural textures + AIEditResult | 3–4 | wgpu compute + narrative integration |
| **P3** | Texture compression + streaming | 4–5 | BC7/ASTC/KTX2 + LOD |
| **P3** | External solver integration | 5 | Houdini/Marvelous MCP bridge |
