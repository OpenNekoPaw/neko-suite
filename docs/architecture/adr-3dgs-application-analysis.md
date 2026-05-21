# ADR: 3D Gaussian Splatting Application Analysis

- **Status**: Proposed
- **Date**: 2026-05-20
- **Scope**: neko-engine, neko-model, neko-preview, ai-video-reference-system

## Context

3D Gaussian Splatting (3DGS) is a real-time radiance field rendering technique that represents scenes as millions of anisotropic Gaussian primitives with learnable position, covariance, color (spherical harmonics), and opacity. Unlike mesh-based pipelines, 3DGS reconstructs photo-realistic scenes directly from multi-view images/video in minutes and renders at 40-80+ FPS via tile-based rasterization.

This ADR analyzes three key questions for neko-suite integration:
1. Can 3DGS serve as AI video reference images?
2. Does 3DGS support skeletal animation?
3. Does 3DGS support scene decomposition?

### Current neko-suite Infrastructure

| Component | Status |
|-----------|--------|
| wgpu compute shader skeleton | 20+ compute shaders in engine-gpu |
| L0-L5 reference tier system | Designed (ai-video-reference-system.md) |
| Scene3DControlProducer | Depth/normal/skeleton rendering from wgpu |
| Camera Motion Translation | 3 paths: cinematic vocabulary / keyframe render / depth sequence |
| HMR2 → SMPL → RetargetMap | Planned P0-P1 (ai-technology-landscape.md) |
| ControlNet pipeline | Gap analysis complete (controlnet-pipeline.md) |
| ROADMAP mention | Phase 3.4: "3DGS (Compute Shader skeleton exists, needs loader/UI)" |

---

## 1. AI Video Reference: Fit Analysis

### Conclusion: Highly Compatible — Natural Upgrade Path for L4 Reference Tier

The existing ai-video-reference-system.md defines L4 = 3D-rendered sequences. 3DGS can significantly enhance this tier:

| Dimension | Current PBR Rendering | 3DGS Rendering | Delta |
|-----------|----------------------|----------------|-------|
| Visual realism | Manual modeling + texturing | Reconstructed from photos, inherently photographic | Eliminates art asset cost |
| Scene coverage | Per-asset modeling required | Phone capture → minutes to reconstruct | Near-zero cost for real-world scenes |
| Depth/normal maps | Precise (geometric render) | Precise (geometry is known) | Equivalent |
| Camera path control | Precise | Precise | Equivalent |
| Character consistency | 3D model inherently consistent | View-dependent appearance preserved | 3DGS better for live-action characters |

### Integration Points

```
Existing pipeline (ai-video-reference-system.md §4, §11, §12):
┌─────────────────────────────────────────────────────────┐
│  scene:render_views  →  turnaround 8-view PNG           │  ← 3DGS replaces render source
│  Camera keyframes    →  cinematic vocabulary            │  ← 3DGS camera path fully compatible
│  Scene3DControlProducer → depth/normal/skeleton PNG     │  ← 3DGS depth/normal natively supported
│  ControlNet pipeline →  provider dispatch               │  ← DiffSplat/MVControl validated
└─────────────────────────────────────────────────────────┘
```

### 3DGS → AI Video Generation Pipeline

```
Capture video → COLMAP SfM → 3DGS training (~5min)
    → novel view rendering → L4 reference images/sequences
    → depth/normal extraction → ControlNet conditioning
    → camera trajectory → GEN3C / Seedance / Kling driving
```

### Key Research Validations

| System | Venue | Approach |
|--------|-------|----------|
| **GEN3C** (NVIDIA) | CVPR 2025 Highlight | 3DGS cache + user camera trajectory → conditioned video generation; generative power focused on unobserved regions |
| **DiffSplat** | ICLR 2025 | Pretrained ControlNet weights for depth/normal/canny from 3DGS |
| **MVControl** | 3DV 2025 | Multi-view ControlNet with edge/depth/normal/scribble conditioning from SuGaR (Gaussians-on-mesh) |
| **CineMaster** | 2025 | Depth maps from 3D layouts as ControlNet conditioning for cinematic video |
| **ReCamDriving** | 2025 | Dense 3DGS renderings as geometric guidance for camera-controlled video |
| **Apple SHARP** | iOS 26 | Single image → SHARP 3DGS → render camera paths → depth → WAN 2.2 video |

### Provider Compatibility

Runway/Kling/Sora do **not** natively accept 3DGS input. The workflow is indirect: render 3DGS to RGB/depth frames → image-to-video or ControlNet input. This aligns with neko-suite's existing `Scene3DControlProducer` architecture — only a new 3DGS render source is needed.

### Alignment with product-evolution-roadmap.md Stage 3

```
Stage 3 Hybrid Strategy:
  Background layers  → AI video generation (atmosphere, environments)
  Character layers   → 2D/3D structured (SemanticMotion + RetargetMap)
  Camera/lighting    → CameraDirector + EmotionArc

3DGS fills the gap:
  Real-world backgrounds → 3DGS reconstruction → precise camera control
  → AI video generation with geometric guidance
  → Character layers composited separately (structured animation)
```

---

## 2. Skeletal Animation: Fit Analysis

### Conclusion: Near-Production for Humans, Research-Stage for General Cases

#### Method Survey (as of 2025)

| Method | Venue | Principle | FPS | Applicable | Maturity |
|--------|-------|-----------|-----|-----------|----------|
| **ASH** | CVPR 2024 | Gaussians on deformable template mesh; coarse-to-fine LBS + local non-rigid | Real-time | Humans + clothing; **supports cross-character retargeting** | High |
| **HuGS** | CVPR 2024 | Canonical space + forward skinning + non-rigid correction | 80 (512x512) | Humans (PSNR 32.49) | High |
| **GaussianAvatar** | CVPR 2024 | FLAME/SMPL-driven rigged Gaussians | Real-time | Human face/body; single video input | High |
| **GoMAvatar** | 2024 | Gaussians-on-Mesh hybrid | 43 | Humans; only 3.63MB/subject | Medium-High |
| **D3GA** | 3DV 2025 (Meta) | Tetrahedral cage deformation; layered garments/hands/face | Real-time | Layered clothing | Medium |
| **SC-GS** | 2024 | Sparse control points learn 6-DoF bases | Real-time | General dynamic scenes | Medium |
| **PhysGaussian** | CVPR 2024 Highlight | Material Point Method simulation on Gaussians | Non-real-time | Soft body / elastic / fluid | Research |
| **RigGS** | 2025 | Auto-discover skeleton from video + bind to Gaussians | Real-time | No-template scenes | Early |
| **SK-GS** | 2024 | Superpoint clustering + part affinity → skeleton discovery | Real-time | General | Early |

#### Integration with neko-suite Skeleton System

```
neko-suite skeleton chain (ai-technology-landscape.md):

  Video → HMR2 (ONNX) → SMPL 24 joints
           ↓ RetargetMap (@neko/shared)
  ┌──────────────┬──────────────┐
  │ VRM Humanoid │ Live2D Params │
  │ 55 bones     │ ~30 params    │
  │ (neko-model) │ (neko-puppet) │
  └──────────────┴──────────────┘
```

**Three integration paths**:

**Path A: SMPL-driven 3DGS (HuGS/ASH)** — Recommended for humans
- Directly reuses HMR2 → SMPL pipeline
- No RetargetMap needed — SMPL is the native driving format
- Best for: photo-realistic human character animation

**Path B: Template mesh-driven 3DGS (GoMAvatar/ASH)**
- Existing VRM skeleton → drives template → 3DGS follows
- Reuses runtime-scene skeleton system
- Best for: existing 3D models with photo-realistic appearance overlay

**Path C: Auto-skeleton discovery (RigGS/SK-GS)**
- No preset skeleton needed; extracted from video
- Best for: non-humanoid characters, animals, mechanical structures
- Lowest maturity — not recommended for near-term dependency

#### Retargeting Status

- **ASH**: Validated cross-character motion transfer with appearance preservation
- **CAMO** (2025): Cross-morphology transfer (e.g., human → animal motion)
- **Practical limitation**: Source and target must share compatible body models (e.g., both SMPL-based). Cross-topology retargeting remains largely unsolved

---

## 3. Decomposition / Segmentation: Fit Analysis

### Conclusion: Medium-High Maturity for Segmentation, Medium for Editing

#### Segmentation Methods

| Method | Venue | Principle | Speed | Key Feature |
|--------|-------|-----------|-------|-------------|
| **Gaussian Grouping** | ECCV 2024 | SAM 2D segmentation + video tracking + learnable identity encoding | Training-time | Fully automatic instance segmentation; supports Local Gaussian Editing |
| **SAGA** | 2024/2025 | Scale-gated affinity features per Gaussian | **4ms** promptable | 2D prompt → 3D segmentation, near real-time |
| **LangSplat** | ICLR 2025 | CLIP features embedded per Gaussian | Inference-time | **Text-driven**: "select the red chair" |
| **GaussianCut** | NeurIPS 2024 | Graph cut on pretrained representations | Inference-time | **No retraining** needed |
| **SAGD** | 2024 | Boundary-enhanced via Gaussian decomposition | Inference-time | Addresses single-Gaussian-spanning-boundaries issue |
| **CoSSegGaussians** | 2025 | DINO semantic + spatial geometry fusion | Inference-time | Zero-shot open-scene segmentation |
| **Split&Splat** | 2025 | Explicit instance modeling | Inference-time | Zero-shot panoptic segmentation |

#### Post-Decomposition Editing Capabilities

| System | Venue | Operations |
|--------|-------|------------|
| **3DSceneEditor** | 2024 | Addition, repositioning, recoloring, replacement, removal of segmented groups; CLIP zero-shot grounding |
| **Point'n Move** | 2024 (TMLR) | Interactive real-time manipulation; 2D point select → 3D translate/rotate; auto-inpaint exposed regions |
| **Inpaint360GS** | 2025 | Object removal + inpainting in 360-degree scenes |
| **Gaussian Grouping** Local Editing | ECCV 2024 | Large-scale object removal with reduced artifacts (1h train + 20min tune) |

**Common pipeline**: Reconstruct → Segment (SAM/CLIP/VLM lifting) → Edit (translate/rotate/remove/recolor) → Inpaint (fill holes)

#### Alignment with neko-suite Architecture

**Scenario 1: Character-Background Separation for AI Video**
```
Real-world scene 3DGS → LangSplat segments character / background
  → Character layer: skeleton-driven (HuGS) → precise animation
  → Background layer: camera path render → AI video generation (Seedance/Kling)
✅ Aligns with product-evolution-roadmap.md Stage 3:
   "Background → AI video, Character → Structured animation"
```

**Scenario 2: Asset Extraction**
```
Captured scene 3DGS → segment individual objects
  → export as independent 3DGS → neko-assets management
  → recompose into new scenes
✅ Aligns with asset-federation architecture (adr-asset-federation.md)
```

**Scenario 3: Agent Interactive Editing**
```
Agent: "Move the vase from the table to the window"
  → LangSplat locates "vase"
  → Point'n Move executes translation
  → Auto-inpaint original position
✅ Aligns with perception-first-roadmap.md Operation layer
```

#### Remaining Limitations

- **Boundary precision**: Single Gaussians straddling object boundaries remain a fundamental issue
- **Inpainting quality**: Hole-filling after object removal has artifacts for complex occlusions
- **No unified toolchain**: Each paper provides its own implementation; no standard SDK exists

---

## 4. Comprehensive Assessment

### Priority Matrix

| Capability | neko-suite Fit | Maturity | Priority | Rationale |
|------------|---------------|----------|----------|-----------|
| 3DGS → AI video reference (depth/normal/RGB) | **Excellent** — plugs into L4 + ControlNet | High | **P1** | Direct value, minimal new architecture |
| 3DGS camera path → video trajectory | **Excellent** — reuses §11 Camera Motion Translation | Medium-High | **P1** | Bundled with reference images |
| 3DGS human skeletal animation | **High** — SMPL pipeline through HMR2 | Medium-High | **P2** | Depends on HMR2 integration |
| 3DGS scene decomposition | **High** — aligns with Stage 3 layered strategy | Medium | **P2** | Enables character/background split |
| 3DGS general skeletal animation | Medium — no standard for non-humanoid | Low | **P3** | Monitor progress |
| 3DGS cross-topology retargeting | Medium — limited to same-topology | Low | **P3** | Monitor progress |

### Core Judgment

3DGS's primary value for neko-suite is **not** replacing mesh pipelines for modeling/animation, but serving as a **photo-realistic digital twin of real-world scenes**, providing precise geometric control signals (depth, normals, camera trajectories) for AI video generation. This naturally complements the Stage 3 strategy: "Background → AI video, Character → Structured animation."

### Implementation Phases

**Phase 1 — Read-Only Viewer + Reference Rendering (~2 weeks)**
- PLY/splat file loader in engine
- Compute shader tile-based Gaussian rasterizer
- neko-preview integration for 3DGS viewing
- `scene:render_views` support for 3DGS scenes
- Depth/normal extraction from 3DGS render

**Phase 2 — AI Video Pipeline Integration (~2 weeks)**
- `GaussianSplat3DControlProducer` implementing Scene3DControlProducer interface
- Camera path editor for 3DGS scenes in neko-model
- Auto-turnaround generation from 3DGS (8-view cache at `.neko/.cache/turnarounds/`)
- Integration with ControlNet pipeline (depth/normal → provider dispatch)

**Phase 3 — Skeletal Animation (~4 weeks)**
- SMPL-driven Gaussian deformation (HuGS/ASH approach)
- Integration with HMR2 → SMPL pipeline (runtime-ml)
- Animation blend/crossfade for animated 3DGS characters
- Export animated 3DGS renders as video reference sequences

**Phase 4 — Decomposition + Advanced Editing (~4 weeks)**
- SAM/CLIP-based Gaussian segmentation
- Object-level selection/manipulation UI in neko-model
- Character/background separation workflow
- Inpainting for removed regions
- Agent tool integration (`3dgs:segment`, `3dgs:edit`)

### Dependencies

```
Phase 1: engine-gpu compute shaders (exists), wgpu pipeline (exists)
Phase 2: ControlNet pipeline P0 fixes (controlnet-pipeline.md), ai-video-reference-system L4
Phase 3: HMR2 ONNX integration (runtime-ml), RetargetMap (@neko/shared)
Phase 4: CLIP ONNX (runtime-ml), perception-first-roadmap Operation layer
```

### Architectural Constraints

- 3DGS rendering runs **entirely in Rust engine** — Webview receives H.264 video stream only (aligned with Route A engine-first rendering)
- 3DGS files stored as project assets, managed by asset-federation registry
- Memory budget: ~250MB VRAM for typical 1M-Gaussian scene; GPU budget controller (adr-engine-gpu-budget.md) must account for this
- Sorting performance: million-scale per-frame depth sorting requires GPU radix sort compute shader

---

## References

### Skeletal Animation
- ASH (CVPR 2024) — Animatable Gaussian Splats on deformable template mesh
- HuGS (CVPR 2024) — Human Gaussian Splatting, 80 FPS, PSNR 32.49
- GaussianAvatar (CVPR 2024) — FLAME/SMPL-driven rigged Gaussians
- GoMAvatar (2024) — Gaussians-on-Mesh hybrid, 3.63MB/subject
- D3GA (3DV 2025, Meta) — Tetrahedral cage deformation
- SC-GS (2024) — Sparse-Controlled Gaussian Splatting
- PhysGaussian (CVPR 2024 Highlight) — Material Point Method simulation
- RigGS (2025) — Automatic skeleton discovery from video
- CAMO (2025) — Category-Agnostic Motion Transfer
- Gaussians-to-Life (3DV 2025) — Text-driven animation of static 3DGS

### Decomposition / Segmentation
- Gaussian Grouping (ECCV 2024) — SAM + video tracking instance segmentation
- SAGA (2024/2025) — Scale-gated affinity, 4ms promptable segmentation
- LangSplat (ICLR 2025) — CLIP-aligned text-driven segmentation
- GaussianCut (NeurIPS 2024) — Training-free graph cut
- SAGD (2024) — Boundary-enhanced Gaussian decomposition
- 3DSceneEditor (2024) — Full add/move/recolor/replace/remove pipeline
- Point'n Move (2024, TMLR) — Interactive real-time manipulation

### AI Video Reference
- GEN3C (NVIDIA, CVPR 2025 Highlight) — 3DGS-conditioned video generation
- DiffSplat (ICLR 2025) — ControlNet weights for 3DGS depth/normal/canny
- MVControl (3DV 2025) — Multi-view ControlNet from SuGaR
- CineMaster (2025) — 3D-aware cinematic text-to-video
- ReCamDriving (2025) — 3DGS geometric guidance for camera control

### neko-suite Internal References
- [ai-video-reference-system.md](./ai-video-reference-system.md) — L0-L5 reference tier system
- [ai-technology-landscape.md](./ai-technology-landscape.md) — AI technology landscape + integration strategy
- [product-evolution-roadmap.md](./product-evolution-roadmap.md) — Stage 1-7 product roadmap
- [perception-first-roadmap.md](./perception-first-roadmap.md) — Agent perception quarterly plan
- [controlnet-pipeline.md](./controlnet-pipeline.md) — ControlNet command bridge
- [adr-asset-federation.md](./adr-asset-federation.md) — Cross-package asset federation
- [adr-engine-gpu-budget.md](./adr-engine-gpu-budget.md) — GPU budget controller
- [adr-engine-preview-subsystem.md](./adr-engine-preview-subsystem.md) — Preview provider registry
