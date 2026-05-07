# ADR: Canvas Preview Boundary

- **Status**: Proposed
- **Date**: 2026-05-07
- **Scope**: neko-canvas, neko-preview, neko-model

## Context

neko-canvas is an infinite canvas editor serving as the semantic orchestration hub of neko-suite. As the project adds richer asset types (3D models, 2D skeletal rigs, panoramic images, HDR environment maps), the question arises: which preview capabilities belong in the canvas, and which should be delegated to specialized extensions?

## Decision

### Core Principle: Lightweight Preview + Delegated Editing

neko-canvas is an **orchestration tool**, not a content creation or viewing tool. It provides uniform, lightweight previews for all asset types and delegates professional editing/viewing to specialized extensions.

### Preview Capability Boundary

#### Canvas CAN do (DOM-native)

| Asset Type | Static (default) | Dynamic (hover/selected) | Implementation |
|------------|------------------|--------------------------|----------------|
| Video | Keyframe thumbnail | Auto-play low-res preview | `<video>` tag, engine pre-transcoded lightweight mp4 |
| Audio | Waveform image | Play audio + waveform animation | `<audio>` + Canvas 2D waveform |
| GIF / Animated image | First frame | Play animation | `<img>` native support |
| Raster image | Thumbnail | - | `<img>` tag |
| 3D Model | Static screenshot | Pre-rendered turntable video | Engine offline render → mp4 |
| 2D Skeletal | Static pose screenshot | Pre-rendered animation clip | Engine offline render → mp4/GIF |
| Panoramic image | Equirectangular flat projection | Pre-rendered rotation video | Engine offline render → mp4/GIF |

**Rule**: If DOM can play it natively (`<video>`, `<audio>`, `<img>`), the canvas can show a dynamic preview. If it requires WebGL, the canvas shows a pre-rendered substitute.

#### Canvas MUST NOT do

| Capability | Reason | Delegate to |
|------------|--------|-------------|
| Real-time 3D rendering | WebGL context per node kills performance | neko-model |
| Camera orbit / light adjustment | Editing, not orchestration | neko-model |
| Spherical panorama interaction | Requires WebGL sphere mesh | neko-preview |
| Video timeline scrubbing | Editing capability | neko-cut |
| Audio mixing / effects | Editing capability | neko-cut |
| Material / shader editing | Editing capability | neko-model |

#### Interaction: Double-click to Delegate

All canvas nodes follow the same interaction pattern:

```
[Static thumbnail] → hover → [Dynamic preview (if DOM-native)]
                   → double-click → [Open in specialized editor/viewer]
                   → right-click → [Send to... menu]
```

### Plugin Responsibility Matrix

| Plugin | Role | Panoramic/HDR | 3D Model | 2D Skeletal | Video/Audio |
|--------|------|---------------|----------|-------------|-------------|
| **neko-canvas** | Orchestration | Flat thumbnail | Static screenshot | Static pose | DOM `<video>`/`<audio>` |
| **neko-preview** | Professional viewing | Spherical WebGL viewer + HDR tone mapping | - | - | Streaming playback |
| **neko-model** | 3D editing | IBL environment map (skybox) | R3F 3D viewport | - | - |
| **neko-puppet** | 2D skeletal editing | - | - | Full skeletal animation editor | - |
| **neko-cut** | Video editing | - | - | - | Timeline + effects |

### Cross-Plugin Data Flow

```
neko-canvas (thumbnail)
  ├── double-click .hdr → neko-preview (spherical viewer)
  │                          └── "Use as Skybox" → neko-model (IBL environment)
  ├── double-click .glb → neko-model (3D editor)
  ├── double-click .mp4 → neko-preview (video playback)
  └── double-click .puppet → neko-puppet (skeletal editor)
```

Direction is always **canvas → specialized plugin**. No specialized plugin depends on canvas for preview. No cross-extension dependencies (enforced by `dependency-cruiser` rule `no-cross-extension-deps`).

### neko-preview vs neko-model for Panoramic Content

| Dimension | neko-preview | neko-model |
|-----------|-------------|------------|
| **Purpose** | "What does this panorama look like?" | "How does this environment light my scene?" |
| **User intent** | Browse, inspect asset quality | Create, adjust 3D scene |
| **Panorama role** | Primary content, full-screen viewing | Background environment, providing IBL |
| **Interaction** | Drag to look around, zoom, tone mapping | Orbit camera, adjust exposure, rotate env map |
| **Output** | Read-only (no modification) | Scene file (.nkm) with skybox reference |
| **Startup cost** | Lightweight WebGL sphere renderer | Full R3F + ECS scene, heavy |

**Conclusion**: Panoramic preview belongs in neko-preview. neko-model consumes panoramic images as environment maps but is not a panorama viewer.

## Rationale

1. **SRP**: Canvas orchestrates, preview views, editors edit. Adding interactive 3D/spherical rendering to canvas would make it a viewer, violating its single responsibility.

2. **Performance**: Canvas may display dozens of nodes simultaneously. DOM-native `<video>`/`<audio>` elements are hardware-accelerated and lightweight. WebGL contexts are not — multiple GL contexts on one page is a known browser bottleneck.

3. **Dependency rules**: The `no-cross-extension-deps` constraint means any extension needing panoramic preview cannot depend on neko-model. A standalone viewer in neko-preview keeps the dependency graph clean.

4. **Consistency**: All canvas nodes follow the same pattern (thumbnail + delegate). No special rendering for any single asset type. This is predictable for users and maintainable for developers.

5. **Dynamic preview via pre-rendering**: For asset types that cannot be previewed with DOM-native elements (3D, skeletal, panoramic), the engine can pre-render short turntable videos or GIFs. This gives users meaningful visual feedback without breaking the canvas's lightweight architecture.

## Consequences

### Positive

- Clear ownership: each plugin knows exactly what it is responsible for
- Canvas stays lightweight and performant regardless of asset diversity
- New asset types follow the same pattern: add thumbnail renderer + delegate command
- No WebGL in canvas webview = simpler CSP, fewer GPU resource conflicts

### Negative

- Pre-rendered dynamic thumbnails require engine support (turntable render, panorama rotation capture)
- Users cannot interactively explore 3D/panoramic assets without opening another editor
- Two-step workflow for "quick look" at 3D/panoramic content (canvas → preview/editor)

### Neutral

- Engine IBL pipeline is shared between neko-preview and neko-model; no duplication at the Rust layer
