# AI Technology Landscape & Neko Suite Integration Strategy

> Related: [ai-capabilities.md](./ai-capabilities.md) (agent pipeline orchestration) | [neko-engine-architecture.md](./neko-engine-architecture.md) | [cloth-surface-materials.md](./cloth-surface-materials.md) | [model-runtime.md](./model-runtime.md)

## Summary

This document surveys the current state of AI technologies relevant to creative content production, assesses their fundamental limitations, projects future development trajectories, and defines neko-suite's integration strategy. The focus is on technologies that intersect with the IDE's creative pipeline: 3D reconstruction, motion capture, expression generation, visual effects, scene composition, and 2D asset creation.

**Key Insight**: Most AI technologies output *pixels or meshes*, not *editable creative assets*. The gap between "AI generates a result" and "the result integrates into a production pipeline" is the strategic opportunity for neko-suite.

---

## Table of Contents

1. [AI Image-to-3D Reconstruction](#1-ai-image-to-3d-reconstruction)
2. [AI 3D Modeling & Generation](#2-ai-3d-modeling--generation)
3. [AI Motion & Pose Estimation](#3-ai-motion--pose-estimation)
4. [AI Facial Expression & Emotion](#4-ai-facial-expression--emotion)
5. [AI Visual Effects & Shaders](#5-ai-visual-effects--shaders)
6. [AI Scene Composition & Layout](#6-ai-scene-composition--layout)
7. [AI 2D Character & Asset Generation](#7-ai-2d-character--asset-generation)
8. [Cross-Cutting Limitations](#8-cross-cutting-limitations)
9. [Future Development Trajectory](#9-future-development-trajectory)
10. [Neko Suite Integration Strategy](#10-neko-suite-integration-strategy)
11. [IDE AI Capability Expansion](#11-ide-ai-capability-expansion)
12. [Implementation Priority Matrix](#12-implementation-priority-matrix)

---

## 1. AI Image-to-3D Reconstruction

### Current State of the Art

| Technology | Architecture | Speed | Output | PBR Materials | Animation-Ready |
|-----------|-------------|-------|--------|:---:|:---:|
| **TripoSR** | LRM (Large Reconstruction Model) | <1s | Mesh + texture | No | No |
| **InstantMesh** | Zero123++ 6-view + LRM | ~10s | Mesh + texture | No | No |
| **TripoSG** | Flow matching + SDF | ~15s | Mesh + PBR | Yes | No |
| **Rodin** (Deemos) | Game-asset focused | ~30s | Mesh + texture | Partial | No |
| **DUSt3R / MASt3R** | No-COLMAP multi-image→point cloud→mesh | ~5s/pair | Dense point cloud / mesh | No | No |
| **3DGS** (Gaussian Splatting) | Gaussian primitives | ~5min training | Gaussian scene (not mesh) | No | No |
| **Unique3D** | Multi-view generation + mesh reconstruction | ~30s | High-quality mesh + color | No | No |
| **Wonder3D** | Cross-domain diffusion | ~3min | Mesh + normal maps + color | Partial | No |

### Key Approaches

**LRM (Large Reconstruction Model)**: Single-image → triplane NeRF features → mesh. Fast (<1s) but limited to simple shapes. Used by TripoSR.

**Multi-View Reconstruction**: Generate multiple views via diffusion (Zero123++), then reconstruct via stereo/SDF. Higher quality but slower. Used by InstantMesh, Wonder3D.

**Flow Matching + SDF**: Direct 3D generation via diffusion over signed distance fields. Produces PBR-ready output. Used by TripoSG.

**Gaussian Splatting (3DGS)**: Represents scenes as millions of 3D Gaussians. Real-time rendering but NOT mesh-based — fundamentally different from polygon pipelines. Exports to mesh require lossy conversion.

**Dense Stereo (DUSt3R)**: Eliminates COLMAP — directly predicts 3D point maps from image pairs. Fast, robust, works with arbitrary image collections. Best for scene reconstruction, not character modeling.

### Fundamental Limitations

1. **Information Irreversibility**: A single 2D image has lost depth, occlusion, and backside information. No algorithm can recover what was never captured.

2. **Janus Problem**: SDS-based methods (Score Distillation Sampling) optimize each view independently, producing faces/features visible from multiple angles on the same model — the "multi-face" artifact.

3. **Mesh Topology**: Marching cubes extraction produces irregular, non-manifold meshes unsuitable for:
   - Animation rigging (no clean edge loops around joints)
   - UV unwrapping (distorted seams)
   - Game engines (too many triangles, no LOD hierarchy)

4. **Texture-Geometry Confusion**: When AI cannot infer depth, it "paints" 3D features onto flat surfaces. A button that should protrude becomes a texture on a flat plane.

5. **No Animation Binding**: None of these technologies produce rigged, weighted skeletons. The gap from "mesh" to "animatable character" requires:
   - Skeleton fitting (RigNet, auto-rigging)
   - Skin weight painting
   - Blend shape creation
   - This post-processing often takes longer than the AI generation itself.

### Practical Assessment for neko-suite

**Usable now**: Cloud APIs (TripoSR, TripoSG) for prototype/concept 3D assets — NOT production character pipeline.

**Not usable**: Direct integration for animatable characters. The skeleton + weight gap makes AI-generated 3D unsuitable for neko-puppet/neko-model without extensive post-processing.

---

## 2. AI 3D Modeling & Generation

### Text-to-3D

| Technology | Approach | Quality | Speed | Production-Ready |
|-----------|---------|---------|-------|:---:|
| **Shap-E** (OpenAI) | Conditional diffusion on implicit functions | Low | ~15s | No |
| **Point-E** (OpenAI) | Text → point cloud → mesh | Low | ~1min | No |
| **DreamFusion** | SDS + NeRF optimization | Medium | ~30min/object | No |
| **Magic3D** (NVIDIA) | Coarse-to-fine SDS + DMTet mesh | High | ~20min | No (research) |
| **Meshy** (Commercial) | Multi-view + reconstruction | Medium-High | ~2min | Partial (API) |
| **CSM** (Common Sense Machines) | Multi-modal → 3D | Medium | ~1min | Partial (API) |

### Character-Specific Tools

| Tool | Input | Output | Skeleton | Limitations |
|------|-------|--------|:---:|------------|
| **PIFuHD** | Human photo | Clothed mesh | No | Frontal bias, no hands |
| **ICON / ECON** | Human photo | SMPL body + clothing | SMPL only | Standard body shapes only |
| **CharacterGen** | Description/image | Stylized character mesh | Partial | Limited pose variety |

### Assessment

Text-to-3D is fundamentally harder than image-to-3D because it requires both semantic understanding AND geometric precision. Current results are:
- Suitable for: props, simple objects, environmental elements
- Not suitable for: characters, mechanical parts, anything requiring precise topology

The practical path for neko-suite is **not** AI 3D generation, but **AI-assisted 3D editing** (face sculpting parameters, material suggestions, pose recommendations) — which the current neko-model architecture already supports.

---

## 3. AI Motion & Pose Estimation

### Video-to-Motion (Most Relevant to neko-suite)

| Technology | Input | Output | Deployable | Accuracy |
|-----------|-------|--------|:---:|---------|
| **HMR2 / 4DHumans** | Video frames | SMPL body params + 3D joints | ONNX | High (single person) |
| **WHAM** | Video | SMPL + global trajectory | PyTorch | High (with world motion) |
| **MotionBERT** | Video | 3D poses | ONNX | High |
| **MediaPipe Pose** | Video/camera | 33 landmarks (2D+3D) | WASM/ONNX | Medium (real-time) |
| **AlphaPose** | Video | Multi-person 2D/3D poses | PyTorch | High (multi-person) |

### Text-to-Motion

| Technology | Input | Output | Quality | Limitations |
|-----------|-------|--------|---------|------------|
| **MDM** (Motion Diffusion Model) | Text | SMPL motion sequence | Medium | Limited motion vocabulary |
| **MotionGPT** | Text / motion completion | SMPL motion sequence | Medium-High | Academic, not production-ready |
| **T2M-GPT** | Text | HumanML3D format | Medium | Dataset-limited (HumanML3D) |
| **MLD** (Motion Latent Diffusion) | Text | SMPL motion sequence | Medium | Lacks fine-grained control |

### Key Limitations

1. **Foot Skating**: All pose estimators produce floating/sliding feet because they don't enforce ground contact constraints. Post-processing (IK foot locking) is mandatory.

2. **Bone Retargeting**: SMPL skeleton (24 joints) ≠ VRM Humanoid (55 bones) ≠ Live2D parameters. Retargeting is a non-trivial mapping problem that neko-suite must solve per target format.

3. **Physics Absence**: AI-generated motion has no physics awareness — characters can interpenetrate objects, defy gravity, or produce biomechanically impossible poses.

4. **Temporal Jitter**: Frame-by-frame estimation lacks temporal coherence. High-frequency noise requires smoothing (Kalman filter, Butterworth low-pass).

5. **Occlusion Failure**: When body parts are occluded (behind objects, self-occlusion), estimated poses degrade dramatically.

### Practical Assessment for neko-suite

**HMR2 is the highest-priority integration target.** It runs as ONNX, produces SMPL parameters that can be retargeted to VRM/Live2D, and the runtime-ml infrastructure already exists.

**MediaPipe** is already partially integrated in neko-live for real-time face tracking. Extending to full-body pose is a natural next step.

**Text-to-motion** is not ready for production — the motion vocabulary is too limited and quality too variable. Better to use motion capture libraries (BVH from Mixamo/CMU) with retargeting.

---

## 4. AI Facial Expression & Emotion

### Face Analysis & Reconstruction

| Technology | Input | Output | Real-time | Deployable |
|-----------|-------|--------|:---:|:---:|
| **MediaPipe FaceMesh** | Camera/video | 468 landmarks + 52 blendshapes | Yes | WASM/ONNX |
| **EMOCA** | Image/video | FLAME 3DMM params + expression + emotion | No | PyTorch |
| **SMIRK** | Image | FLAME expression + shape params | No | PyTorch |
| **DECA** | Image | FLAME 3DMM + albedo + lighting | No | PyTorch |
| **Wav2Lip** | Audio + face video | Lip-synced video | Near real-time | PyTorch |

### Expression Mapping

```
ARKit 52 BlendShapes (Apple)  ← MediaPipe (already in neko-live)
        ↓
VRM 17 Expressions            ← neko-model vmcMapping (done)
Live2D Parameters (~30)       ← neko-puppet puppetMapping (done)
Custom ExpressionSpec         ← @neko/shared (TODO)
```

### Text/Emotion → Expression

No dedicated AI model exists for text→expression. The practical approach is:

```
Text → LLM emotion classification → Lookup table → ExpressionSpec parameters

Emotion vocabulary:
  joy/sadness/anger/fear/surprise/disgust/contempt (Ekman 7)
  + intensity (0.0-1.0)
  + micro-expression noise (subtle involuntary signals)
```

This is a **rules-based system with LLM front-end**, not a learned model. neko-suite should implement it as `EmotionArc` — a time-series of emotion states that drive ExpressionSpec parameters.

### Practical Assessment

**MediaPipe FaceMesh** is production-ready and already partially integrated. The 52 ARKit blendshapes cover the full expression space.

**EMOCA/SMIRK** are research-grade. For neko-suite, the LLM → emotion lookup → ExpressionSpec path is more practical and controllable than learned expression models.

**Wav2Lip** outputs video pixels, not parameters — cannot be used to drive Live2D/VRM characters. The equivalent for neko-suite is **viseme generation from TTS timestamps** (phoneme → mouth shape mapping), which is deterministic and controllable.

---

## 5. AI Visual Effects & Shaders

### Current State

| Approach | Example | Output | Editable | Production-Ready |
|---------|---------|--------|:---:|:---:|
| **Text→Shader** | ShaderGPT, GPT-4 prompting | GLSL/WGSL code | Yes (code) | Research stage |
| **Style Transfer** | NST, AdaIN, CAST | Stylized frames | No (pixels) | Yes (slow) |
| **Video Effects** | Runway Gen-2, Pika | Stylized video | No (pixels) | Yes (cloud) |
| **LUT Generation** | AI color grading | .cube LUT file | Yes (LUT) | Emerging |
| **Image Filters** | Various CNNs | Processed image | No (pixels) | Yes |

### Key Insight: AI Effects = Pixels, Not Parameters

The fundamental problem with AI-generated visual effects:

```
Traditional VFX pipeline:
  Scene → Effect Parameters (editable) → Rendered Output
  User can adjust parameters, change timing, animate effects

AI VFX pipeline:
  Scene → AI Model → Pixels (final)
  No adjustable parameters, no animation curves, no compositing control
```

**neko-suite's approach should be**: Use AI to *suggest* effect parameters (via AIEditResult), not to *generate* effect pixels. The existing GPU shader pipeline (Curves/HSL/ChromaKey/etc.) is far more controllable.

```typescript
// AI suggests parameters, engine applies them
{ type: 'update-color-correction',
  params: { temperature: 6500, tint: -5, exposure: 0.3 } }

// NOT: AI generates a stylized frame
// (loses all editability)
```

### Text-to-Shader Status

LLMs can generate GLSL/WGSL shader code from text descriptions with ~60-70% success rate for simple effects. Failure modes:
- Incorrect uniform bindings
- Missing edge cases (NaN, division by zero)
- Performance issues (unbounded loops)
- Cross-platform incompatibility

For neko-suite, this is a **P3 feature** — interesting but not critical. The existing hand-crafted shader library covers all production needs.

---

## 6. AI Scene Composition & Layout

### Scene Generation Approaches

| Approach | Example | Output | Practical Level |
|---------|---------|--------|:---:|
| **AI Asset Arrangement** | Holodeck (NVIDIA), SceneFormer | Positioned 3D objects in scene | Most practical |
| **Text→3D Scene** | Text2Room, SceneScape | Textured 3D room | Research |
| **360 Environment** | Blockade Labs Skybox AI | 360 HDR skybox | Production-ready |
| **Depth-based 2.5D** | Depth Anything + SAM + parallax | Layered 2D→pseudo-3D | Production-ready |
| **Progressive 3D** | WonderWorld | Walk-through 3D scenes | Research |

### Holodeck Model (Most Practical for neko-suite)

The Holodeck approach is the most practical path for AI scene generation:

```
User prompt: "a cozy coffee shop in autumn"
    ↓
LLM analyzes prompt → structured SceneSpec
    ↓
Asset selection from library (chairs, tables, plants, windows)
    ↓
Spatial layout (rule-based + LLM reasoning)
    ↓
Lighting configuration (warm ambient + window directional)
    ↓
Atmosphere (fog, particle system, color grade)
    ↓
Complete scene ready for rendering
```

This maps directly to neko-suite's existing SceneSpec format:

```typescript
interface SceneSpec {
  environment: { skybox, fog, particles };
  characters: CharacterPlacement[];
  props: PropPlacement[];
  camera: CameraSpec;
  lighting: LightSpec;
  effects: EffectSpec[];
}
```

### 360 Skybox Generation

Blockade Labs and similar services generate HDR 360 skyboxes from text prompts. These are **immediately usable** as `SceneSpec.atmosphere.skybox` with no conversion needed.

### Depth-Based 2.5D Scene Creation

```
Single photo → Depth Anything v2 (ONNX) → depth map
                                         ↓
            + SAM segmentation ──→ foreground/midground/background layers
                                         ↓
            + parallax factors ──→ SceneSpec with layer offsets
                                         ↓
            Camera motion ──→ Ken Burns / parallax effect
```

This is achievable with local ONNX models (Depth Anything v2 ~50MB, SAM ~100MB) and produces a compelling pseudo-3D effect from a single image. **P1 priority** for neko-suite.

---

## 7. AI 2D Character & Asset Generation

### The Live2D Gap

This is the most critical analysis for neko-puppet. The gap between AI image generation and Live2D-ready assets is enormous:

```
What AI generates:        What Live2D needs:
─────────────────        ─────────────────
Single PNG image         50-150 layered PSD
  (flat, merged)           (each body part separate)
                         + Mesh subdivision per part
                         + Parameter space definition
                         + Deformer hierarchy
                         + Physics configuration
                         + Expression presets
```

| Step | AI Automation Level | Manual Work Required |
|------|:---:|---|
| Character concept generation | High (DALL-E, Midjourney) | Prompt engineering |
| Layer separation (SAM, etc.) | Medium (reference grade) | Fix artifacts, add missing layers |
| Mesh creation per part | None | Fully manual (Cubism Editor) |
| Parameter binding | None | Fully manual (art + technical) |
| Deformer setup | None | Fully manual |
| Physics chain config | None | Fully manual (tuning) |
| Expression preset creation | None | Manual per expression |

**AI can generate the concept; the remaining 90% of Live2D production is manual.**

### Layer Auto-Segmentation

Tools like SAM (Segment Anything) can separate a character image into parts:
- Hair, face, eyes, mouth, body, arms, legs, accessories
- Quality: ~70% usable, 30% needs manual correction
- Missing: inner mouth, eyelids (closed), back hair layer, accessories behind body

The result is "reference grade" — useful as a starting point, not production-ready.

### Animate Anyone / Live Portrait

These technologies generate **video pixels** of animated characters from a reference image + driving signal:

```
Reference image + motion signal → Animated video (MP4)
                                  NOT: Live2D parameters
                                  NOT: Editable animation
                                  NOT: Controllable expression
```

They are competitors to Live2D in the *output* domain (animated characters), but not tools that help *create* Live2D assets.

### Spine / Inochi2D

Similar gap to Live2D — AI cannot generate the rigging, weight painting, or IK chain configuration required for skeletal 2D animation.

### Practical Assessment for neko-suite

**neko-puppet's strategic value is helping users USE existing Live2D models efficiently**, not AI-generating Live2D models from scratch. The integration priorities are:

1. **Expression preset suggestions**: LLM analyzes character → suggests ExpressionSpec parameter ranges
2. **Motion retargeting**: Video → HMR2/MediaPipe → Live2D parameter mapping (neko-live already started)
3. **Template system**: Pre-configured MOC3 templates with standard expression/motion presets
4. **AI-assisted tuning**: Agent tools (`PuppetSetExpression`, `PuppetListExpressions`) for parameter adjustment

---

## 8. Cross-Cutting Limitations

### Temporal Consistency

The universal problem across ALL sequence-output AI: each frame is generated independently, causing jitter, flicker, and style drift.

```
Frame N:   "a cat on a table"  → specific cat pose, lighting, fur texture
Frame N+1: "a cat on a table"  → DIFFERENT cat pose, lighting, fur texture

Even with the same prompt, each frame is an independent sample from the model's distribution.
```

Mitigation approaches (all partial):
- Temporal attention (AnimateDiff): helps but doesn't eliminate
- Reference frame conditioning: anchors style but not motion coherence  
- Post-processing stabilization: fixes position jitter, not style drift
- **Neko-suite approach**: Use AI for keyframes, interpolate between them with deterministic methods (engine interpolation, not AI)

### The Editability Gap

```
AI output spectrum:

  Pixels (video/image)          Parameters (editable)
  ←─────────────────────────────────────────────→
  │                                              │
  Runway Gen-2                    neko-engine shader params
  Midjourney                      Live2D parameters
  Animate Anyone                  VRM BlendShapes
  StyleGAN                        SceneSpec JSON
  │                                              │
  Zero editability               Full editability
  High visual quality            Controlled quality
  No compositing                 Full compositing
```

**neko-suite must always prefer parameter-based approaches over pixel-based AI.** The role of AI is to *suggest parameters*, not to *generate pixels* (except for concept art / asset generation where pixels ARE the asset).

### Model Size vs. Deployment

| Tier | Model Size | Examples | Deployment |
|------|-----------|---------|-----------|
| Tiny | <50MB | MediaPipe, MiDaS v2.1 small | WASM / ONNX in-process |
| Small | 50-200MB | HMR2, Depth Anything v2, emotion BERT | ONNX via runtime-ml |
| Medium | 200MB-2GB | Demucs, XTTS, SAM | Managed via neko-market |
| Large | 2-10GB | AnimateDiff, DUSt3R, StableDiffusion | Ollama / external service |
| Cloud | N/A | GPT-4V, Claude Vision, Sora, DALL-E | API calls |

neko-suite's model strategy must respect VSCode extension size limits (~100MB) and user disk/memory constraints.

---

## 9. Future Development Trajectory

### 2025-2027 Predictions

| Domain | Current | Expected 2027 | Impact on neko-suite |
|--------|---------|--------------|---------------------|
| **Image-to-3D** | Mesh only, no rig | PBR + auto-rig emerging | Could generate prototype characters |
| **Video generation** | 4-10s clips | 30-60s coherent clips | Longer AI scenes for timeline |
| **Motion estimation** | Single-person SMPL | Multi-person + object interaction | More robust video→motion pipeline |
| **Expression AI** | Classification only | Nuanced emotional reasoning | Better EmotionArc generation |
| **Scene generation** | Room-scale only | Outdoor + dynamic scenes | More SceneSpec auto-generation |
| **Live2D AI** | Concept image only | Maybe: auto-layer separation | Still won't auto-rig |
| **Temporal consistency** | Major problem | Significantly improved | AI video more usable as timeline clips |
| **Local inference** | Limited, large models | 4-bit quant + NPU acceleration | More models run locally |

### What Won't Change

1. **Mesh topology quality** — Will improve but won't match hand-crafted topology for years
2. **Live2D auto-rigging** — The parameter binding problem is fundamentally creative, not computational
3. **Physics awareness** — AI-generated motion will still lack physics grounding
4. **Editability gap** — AI will continue producing pixels; parameter-based approaches remain necessary

### Strategic Implications

neko-suite should:
- Build **parameter-based pipelines** now (they won't become obsolete)
- Use **AI for suggestion, not generation** in character/animation domains
- Invest in **retargeting infrastructure** (the bridge between AI output and editable formats)
- Keep **cloud AI integration paths open** (API adapters are cheap to maintain)
- Prioritize **local ONNX models** for latency-sensitive workflows (motion capture, expression tracking)

---

## 10. Neko Suite Integration Strategy

### Three Integration Tiers

```
Tier 1 — Local ONNX (P0-P1, runtime-ml)
├── MediaPipe Pose/Face (real-time tracking)
├── HMR2 (video → SMPL body → retarget to VRM/Live2D)
├── Depth Anything v2 (image → depth → 2.5D scene)
├── MiDaS v2.1 (lightweight depth estimation)
├── Demucs (audio source separation)
├── emotion BERT (text → emotion classification)
└── Size: 50-200MB each, runs in engine process

Tier 2 — Managed Models (P1-P2, neko-market)
├── SAM (segmentation for layer extraction)
├── XTTS (TTS with voice cloning)
├── Whisper (already integrated, enhance)
├── DUSt3R (multi-image → 3D scene)
└── Size: 200MB-2GB, downloaded via marketplace

Tier 3 — Cloud API (P0, already integrated)
├── Image generation (DALL-E, Midjourney, etc.)
├── Video generation (Sora, Runway, Kling, etc.)
├── Music generation (Suno, etc.)
├── VLM understanding (Claude Vision, GPT-4V)
└── 3D generation (TripoSR, Meshy API)
```

### Per-Module Integration Map

#### neko-cut (Video Editing)
| Capability | Technology | Priority | Integration Point |
|-----------|-----------|----------|------------------|
| Auto-edit (scene detection + assembly) | SceneDetect + LLM reasoning | P1 | AI action `ai-auto-edit` |
| Beat sync (music→cut points) | FFT peak detection + onset strength | P1 | AI action `ai-match-music` |
| Color match across clips | Histogram matching + LLM suggestion | P2 | AIEditResult `update-color-correction` |
| AI background remove (frame-level) | SAM + video propagation | P2 | Already integrated as AI action |

#### neko-model (3D Editing)
| Capability | Technology | Priority | Integration Point |
|-----------|-----------|----------|------------------|
| Video → 3D motion capture | HMR2 ONNX | P0 | runtime-ml → SemanticMotion |
| Face parameter generation | LLM → 22 facial params | P1 | MCP tool `face.generate_params` |
| Image → face sculpting | DECA/face detection → param fitting | P2 | MCP tool `face.from_image` |
| 3D asset prototype (cloud) | TripoSR/Meshy API | P2 | Cloud adapter in neko-agent |

#### neko-puppet (2D Animation)
| Capability | Technology | Priority | Integration Point |
|-----------|-----------|----------|------------------|
| Expression preset suggestions | LLM → ExpressionSpec params | P1 | `PuppetSetExpression` agent tool |
| Video → Live2D parameter mapping | MediaPipe Face + retargeting | P1 | neko-live integration |
| Viseme generation from TTS | Phoneme timestamps → mouth shapes | P2 | VoiceSpec + viseme channel |

#### neko-canvas (Storyboard)
| Capability | Technology | Priority | Integration Point |
|-----------|-----------|----------|------------------|
| Character consistency (IP-Adapter) | IP-Adapter reference injection | P1 | ControlNet pipeline |
| Scene background consistency | ControlNet depth/normal conditioning | P1 | ControlNet pipeline |
| Holodeck-style scene layout | LLM → SceneSpec JSON | P2 | Canvas scene generation tool |

#### neko-audio / neko-tools
| Capability | Technology | Priority | Integration Point |
|-----------|-----------|----------|------------------|
| Audio source separation | Demucs ONNX | P0 | neko-tools + Media Diff Phase 4 |
| Enhanced transcription | Whisper + alignment | P1 | Already integrated, improve accuracy |
| TTS with voice cloning | XTTS / OpenAI TTS | P2 | VoiceSpec + CharacterBundle |
| Beat detection | Librosa-equivalent FFT | P1 | `ai-match-music` action |

---

## 11. IDE AI Capability Expansion

### Current AI Inventory

```
Already integrated:
├── LLM routing (Claude/GPT/Gemini) via Vercel AI SDK
├── Image generation (10+ providers)
├── Video generation (8+ providers)
├── Music generation (Suno, etc.)
├── TTS (OpenAI TTS)
├── Whisper ASR
├── MediaPipe face tracking (neko-live, partial)
├── VLM multimodal understanding
├── Pipeline orchestration (6 Flows)
├── Quality assessment (VisionEvaluator + AudioEvaluator)
└── Creative Memory + Coordinator + SubAgent
```

### New AI Capabilities to Introduce

#### Editor Layer — Smart Completion & Understanding

**SmartCompletion**: LSP CompletionProvider + LLM streaming for creative text (Fountain scripts, parameter names, effect descriptions).

**VLM Context Understanding**: Render current viewport → VLM analysis → inject into agent context as PerceptionContext. Enables "look at what I'm working on and suggest improvements."

**Unified ContextProvider**: Aggregate context from all open editors (timeline state, canvas layout, script content, puppet parameters) → structured context for LLM.

#### Motion & Expression Pipeline

```
Video file
    ↓ HMR2 ONNX (runtime-ml)
    ↓
SMPL body parameters + 3D joints
    ↓ RetargetMap
    ↓
┌──────────────┬──────────────┐
│ VRM Humanoid │ Live2D Params │
│ (neko-model) │ (neko-puppet) │
└──────────────┴──────────────┘
    ↓
SemanticMotion (.nkmotion)
    ↓
Timeline element / real-time preview
```

**RetargetMap** is the critical missing piece — a bone/parameter mapping system that converts between skeleton formats.

#### Audio Intelligence

```
Audio file
    ↓ Demucs ONNX (runtime-ml)
    ↓
┌────────┬────────┬────────┬────────┐
│ Vocals │ Drums  │ Bass   │ Other  │
└────────┴────────┴────────┴────────┘
    ↓               ↓
  Whisper        Beat detection
  (subtitles)    (cut points)
    ↓               ↓
  Subtitle track  ai-match-music
```

#### Stage 3 — Narrative AI

**EmotionArc**: Time-series of emotion states that drive all character parameters:

```typescript
interface EmotionArc {
  keyframes: Array<{
    time: number;
    emotion: EmotionVector;  // joy/sadness/anger/fear/surprise + intensity
    trigger: string;         // "learns the truth" / "sees the sunset"
  }>;
}
```

EmotionArc drives: ExpressionSpec (face) + SemanticMotion (body language) + VoiceSpec (tone) + LightSpec (atmosphere) + MusicSpec (score) simultaneously.

**CharacterAgent**: Per-character AI with independent memory, personality, and voice:

```typescript
interface CharacterAgent {
  persona: PersonaSpec;           // personality traits, speech patterns
  memory: CharacterMemory;        // what this character knows/has experienced
  voice: VoiceSpec;               // TTS voice + speaking style
  expressionStyle: ExpressionStyle; // how emotions map to physical expression
}
```

**CameraDirector AI**: LLM generates camera keyframes based on scene emotion and dialogue:

```
Scene content + EmotionArc → LLM reasoning → CameraKeyframe[]
  "tense confrontation" → close-up alternating + slow push-in
  "peaceful landscape" → wide establishing + slow pan
```

---

## 12. Implementation Priority Matrix

### P0 — Immediate (Infrastructure Exists)

| Item | Module | Effort | Prerequisite |
|------|--------|--------|-------------|
| HMR2 ONNX video→motion | runtime-ml | Medium | ONNX model download |
| Demucs ONNX audio separation | runtime-ml | Medium | ONNX model download |
| Beat detection (FFT) | neko-cut | Low | None |
| Depth Anything v2 → 2.5D | runtime-ml | Medium | ONNX model download |
| RetargetMap types | @neko/shared | Low | None |

### P1 — Near-term (Current Iteration)

| Item | Module | Effort | Prerequisite |
|------|--------|--------|-------------|
| SemanticMotion recording from neko-live | neko-live + @neko/shared | Medium | HMR2/MediaPipe |
| EmotionArc + emotion→expression LUT | @neko/shared + neko-agent | Medium | ExpressionSpec |
| IP-Adapter reference injection | neko-canvas + ControlNet | Medium | ControlNet P0 fix |
| ai-match-music (beat sync) | neko-cut | Medium | Beat detection |
| ai-auto-edit (scene detection) | neko-cut | Medium | SceneDetect logic |
| VoiceSpec + TTS viseme driving | @neko/shared + neko-agent | Medium | TTS integration |
| Expression preset AI suggestions | neko-puppet + neko-agent | Low | PuppetListExpressions tool |

### P2 — Mid-term

| Item | Module | Effort | Prerequisite |
|------|--------|--------|-------------|
| CharacterAgent framework | neko-agent | High | EmotionArc + VoiceSpec |
| CameraDirector AI | neko-cut + neko-agent | Medium | Camera keyframe track |
| Holodeck scene layout | neko-canvas + neko-agent | High | SceneSpec |
| XTTS voice cloning | runtime-ml / neko-market | Medium | XTTS model management |
| SAM layer extraction | runtime-ml | Medium | SAM ONNX model |
| Image→2.5D scene pipeline | neko-cut + runtime-ml | Medium | Depth Anything + SAM |

### P3 — Long-term

| Item | Module | Effort | Prerequisite |
|------|--------|--------|-------------|
| Text-to-shader generation | neko-agent | Low | LLM WGSL generation |
| Local VLM (LLaVA/MiniCPM-V) | neko-market + Ollama | Medium | Model management |
| 3DGS loader + viewer | neko-model | High | Compute shader infra |
| Multi-person motion capture | runtime-ml | High | AlphaPose ONNX |
| AnimateDiff local inference | runtime-ml | High | Large model management |
| AI normal-map generation | neko-sketch | Medium | Sobel shader + LLM suggestion |

### Local Model Deployment Tiers

```
Tier 1 (P0) — Ships with extension or auto-downloads on first use
  MediaPipe Pose/Face    ~10MB   WASM
  MiDaS v2.1 small      ~20MB   ONNX
  emotion-BERT           ~50MB   ONNX

Tier 2 (P1) — Downloaded via neko-market on demand
  HMR2                   ~100MB  ONNX
  Depth Anything v2      ~50MB   ONNX
  Demucs                 ~200MB  ONNX

Tier 3 (P2) — Managed via neko-market, large downloads
  SAM                    ~400MB  ONNX
  XTTS                   ~1.5GB  PyTorch→ONNX
  DUSt3R                 ~500MB  ONNX
  Whisper large-v3       ~1.5GB  ONNX (currently using small)

Tier 4 (P3) — External runtime (Ollama, ComfyUI MCP)
  LLaVA / MiniCPM-V     ~4-8GB  GGUF via Ollama
  StableDiffusion        ~4-8GB  via ComfyUI MCP
  AnimateDiff            ~5GB    via ComfyUI MCP
```

---

## Design Principles for AI Integration

1. **Parameters over Pixels**: Always prefer AI that outputs editable parameters over AI that outputs final pixels.

2. **Retarget over Rewrite**: Build robust retargeting infrastructure (RetargetMap) rather than per-model converters.

3. **Local over Cloud for Latency-Sensitive**: Motion capture, expression tracking, and real-time feedback must run locally (ONNX/WASM).

4. **Cloud for Generation**: Image/video/music generation naturally fits cloud APIs (large models, occasional use).

5. **Suggest over Automate**: AI should suggest parameters for user review, not silently apply changes.

6. **Graceful Degradation**: All AI features must be optional. The IDE must function fully without any AI model installed.

7. **Standard Formats as Bridge**: Use standard formats (glTF, BVH, .cube, .exp3.json) as the interoperability layer between AI output and neko-suite internal formats.

---

*Last updated: 2026-04-16*
