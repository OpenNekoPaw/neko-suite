# ADR: Canvas Preview Boundary

- **Status**: Implemented
- **Date**: 2026-05-07
- **Scope**: neko-canvas, neko-preview, neko-model, neko-agent, @neko/neko-client, neko-engine
- **Refines**: `adr-panoramic-image-preview.md` q2 reuse decision (line 378) and NFR reusability (line 140)
- **Related**: `adr-canvas-block-container.md`, `openspec/changes/canvas-block-container-architecture`

## Context

neko-canvas is an infinite canvas editor serving as the semantic orchestration hub of neko-suite. As the project adds richer asset types (3D models, 2D skeletal rigs, panoramic images, HDR environment maps), the question arises: which preview capabilities belong in the canvas, and which should be delegated to specialized extensions?

A secondary question arises for neko-agent: when the AI assistant generates, retrieves, or compares rich media assets (including panoramic/HDR content), what level of inline preview should the chat UI provide?

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
| **neko-canvas** | Orchestration | Flat equirectangular thumbnail | Static screenshot | Static pose | DOM `<video>`/`<audio>` |
| **neko-agent** | AI assistant | Center-crop 90° FOV thumbnail | Static screenshot | Static pose | Poster/waveform (idle) or neko-client inline playback (active) |
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

neko-agent (chat media card)
  ├── click .hdr → neko-preview (spherical viewer)
  ├── click .glb → neko-model (3D editor)
  ├── click .mp4 → neko-preview (video playback)
  └── "Send to Canvas" → neko-canvas (create node)
```

Direction is always **canvas/agent → specialized plugin**. No specialized plugin depends on canvas or agent for preview. No cross-extension dependencies (enforced by `dependency-cruiser` rule `no-cross-extension-deps`).

#### Delegation Mechanisms (Exhaustive List)

Cross-plugin delegation must not introduce import-level dependencies. The only permitted mechanisms are:

| Mechanism | When to use | Example |
|-----------|-------------|---------|
| `vscode.commands.executeCommand(id, ...args)` | Fire-and-forget actions, opening editors | `neko.preview.openPanoramicImage`, `neko.preview.openPanoramicVideo`, `neko.preview.openBestPanoramic`, `neko.model.useEnvironment` |
| `vscode.commands.executeCommand('vscode.openWith', uri, viewType)` | Open a file in a specific custom editor | Open `.hdr` in `neko.preview.panoramicImage`; open trusted 360 video in `neko.preview.panoramicVideo` |
| `vscode.extensions.getExtension<API>(id)?.exports` | Query capabilities or call methods with return values; `API` must be a local minimal interface or a shared contract | `PreviewPlaybackAPI.probeMedia(path)` |
| Shared types in `@neko/shared` | Type contracts consumed by multiple extensions | `ImageProbeInfo`, `MediaInfo`, `projectionType` |
| Shared protobuf in `@neko/proto` | Engine communication contracts | Proto DTOs for engine actions |

**Prohibited**:
- Direct `import` from another extension's package (violates `no-cross-extension-deps`)
- Importing another extension's exported API type from its package; consumers must declare the minimal shape locally or use a contract moved to `@neko/shared`
- Passing live objects (class instances, callbacks) across extension boundaries — use serializable data only
- Defining shared contracts inside a specific extension package — move to `@neko/shared` or `@neko/proto`

Final panoramic routing names:

| Route | Value |
|-------|-------|
| Panoramic image viewType | `neko.preview.panoramicImage` |
| Panoramic video viewType | `neko.preview.panoramicVideo` |
| Explicit image command | `neko.preview.openPanoramicImage` |
| Explicit video command | `neko.preview.openPanoramicVideo` |
| Best-effort route command | `neko.preview.openBestPanoramic` |

### neko-agent Preview Boundary

neko-agent is a **conversational interface**, not a spatial editor. Users consume text + result references; media previews serve one purpose: **confirm whether a generated/retrieved asset is correct without leaving the chat**.

Agent's core loop is **generate → confirm → iterate**. Every context switch (chat → preview panel → chat) adds friction to this loop. Therefore agent supports **inline playback** for video/audio via `@neko/neko-client` (WebCodecs + PCM), allowing users to confirm results without leaving the conversation.

#### Two-state card model

Media cards that support inline audio/video playback have two states:

```
[Idle]   Engine-provided poster/waveform + metadata badges (pure <img>, lightweight)
            ↓ user clicks play
[Active]  neko-client inline playback (H264StreamClient + AudioStreamClient + FrameScheduler)
            ↓ user clicks stop / playback ends / another card starts
[Idle]   Returns to poster (resources released)
```

Only **one** playback-capable card can be Active at a time (same constraint as canvas). Panoramic cards remain Idle-only thumbnails and delegate interaction to `neko-preview`. Idle cards are identical to the former static-only design — zero streaming overhead in chat history scrolling.

#### Agent CAN do

| Asset Type | Idle state | Active state (click to play) | Implementation |
|------------|------------|------------------------------|----------------|
| Raster image | Thumbnail (ImagePreview) | — (click opens in VSCode) | `<img>` tag |
| GIF / Animated image | Animated thumbnail | — (click opens in VSCode) | `<img>` native |
| Video | Engine-provided poster + duration badge | **Inline H.264 playback** via neko-client | `<img>` idle → `<canvas>` + H264StreamClient active |
| Audio | Engine-provided waveform + duration badge | **Inline PCM playback** via neko-client | `<img>` idle → AudioStreamClient + waveform animation active |
| Panoramic image | Center-crop 90° FOV thumbnail | — (click opens spherical preview in neko-preview) | Engine `fov-crop` → `<img>`; delegate to `neko.preview.panoramicImage` |
| 3D Model | Static screenshot | Engine pre-rendered turntable GIF | Engine offline render → `<img src="*.gif">` |
| 2D Skeletal | Static pose screenshot | Engine pre-rendered animation GIF | Engine offline render → `<img src="*.gif">` |
| 360° Video | Engine-provided poster + duration badge | — (click opens spherical preview in neko-preview) | Engine `thumbnail` → `<img>`; delegate to `neko.preview.panoramicVideo` |

**Constraint**: DOM `<video>` / `<audio>` elements remain prohibited — VSCode webview sandbox has limited codec support. All playback uses neko-client's WebCodecs (H.264 hardware decode → VideoFrame → Canvas 2D `drawImage`) and Web Audio API (PCM f32le → AudioBuffer), which bypass native codec limitations entirely.

**Toggle**: `ablation:agent-inline-playback` (default: on). When off, cards degrade to idle-only with click → open in neko-preview (the former static-card design).

#### Agent MUST NOT do

| Capability | Reason | Delegate to |
|------------|--------|-------------|
| DOM `<video>` / `<audio>` elements | VSCode webview sandbox codec limitations; use neko-client WebCodecs + PCM instead | — |
| WebGL sphere rendering | Heavyweight, out of scope for chat | neko-preview |
| HDR tone mapping controls | Editing, not confirmation | neko-preview |
| Video timeline scrubbing / seek | Editing capability; inline playback is play/stop only | neko-preview |
| Image zoom/pan viewer | Chat cards are compact; open in VSCode for detail | VSCode image viewer |

#### Inline playback data flow

```
User clicks play button on VideoCard
  ↓
postMessage('media:play', { filePath, startTime? })
  ↓
Extension host:
  ├─ api = vscode.extensions.getExtension<PreviewPlaybackAPI>('neko.neko-preview')?.exports
  ├─ streamIds = await api.startPlayback(filePath, mediaInfo)
  └─ wsUrls = api.getStreamWebSocketUrl(streamIds)
  ↓
postMessage('media:streamReady', { videoWsUrl, audioWsUrl })
  ↓
Agent webview (InlineChatPlayer component):
  ├─ H264StreamClient.connect(videoWsUrl)   → WebCodecs decode → canvas drawImage
  └─ AudioStreamClient.connect(audioWsUrl)  → PCM → Web Audio API
  ↓
FrameScheduler syncs video frames to audio master clock
  ↓
User clicks stop / playback ends
  ├─ webview disconnects H264StreamClient / AudioStreamClient
  ├─ postMessage('media:stop', { videoStreamId, audioStreamId })
  └─ extension host calls api.stopStreams(videoStreamId, audioStreamId)
  ↓
Return to poster
```

The extension host that starts a playback stream owns its cleanup. `stopStreams()` must be called when playback stops, when another card becomes Active, when the chat webview is disposed, and when stream startup fails after either stream has been allocated.

#### Canvas vs Agent: Why Thumbnails Differ for Panoramic Content

Canvas displays the **full equirectangular flat projection** — the spatial layout gives nodes enough room, and users arranging assets in a storyboard expect to see the complete projection as a reference.

Agent displays a **center-crop 90° FOV extract** — a flat equirectangular strip in a compact chat bubble is unrecognizable to most users. Cropping the center viewport produces a "what you'd see standing in the middle" thumbnail that is immediately comprehensible.

Both consume the same engine pre-render pipeline for turntable/rotation previews.

Canvas and Agent do not own panoramic view angles. Interactive `yaw/pitch/fov` belongs to neko-preview's viewer-local state; only low-frequency semantic requests such as FOV crop thumbnails, saved default views, screenshots, tile requests, or `EnvironmentPlacement` for neko-model cross the engine/shared-contract boundary.

#### Shared Preview Assets

Canvas and Agent consume the same engine-generated preview assets. No extension renders these independently:

```
Engine preview manifest / variant API
  ├── role=proxy       → flat equirectangular proxy (for Canvas node preview)
  ├── role=thumbnail   → poster/static thumbnail (for video and generic cards)
  ├── role=fov-crop    → 90° FOV center crop (for Agent panoramic cards)
  ├── model:turntable  → 3D turntable mp4   (for Canvas + Agent hover)
  └── puppet:clip      → animation mp4/GIF  (for Canvas + Agent hover)

neko-canvas → consumes as <img>/<video> in node (DOM-native allowed)
neko-agent  → consumes as <img> in idle cards; neko-client streams for active playback
```

Canvas/Agent preview variant lifecycle is request-scoped:

1. The extension host registers a source through `registerPreviewAsset({ source, kind, expectedProjection })`.
2. It requests the needed `PreviewVariant` (`proxy`, `thumbnail`, or `fov-crop`) with an optional `PanoramaViewState`.
3. It sends only the variant URL/metadata to the webview.
4. It calls `unregisterPreviewAsset(assetIdOrToken)` in `finally`, on source change, and on webview disposal for any resource it started.

This mirrors the engine-first preview rule: Canvas and Agent may display engine-issued URLs, but they do not create a direct local media loading path for panoramic content.

Implementation note (2026-05-13): the Phase 1 engine variant path now generates role-specific runtime files for `proxy`, `thumbnail`, `fov-crop`, and `screenshot` instead of returning passthrough source descriptors. Generated files are registered behind engine-managed tokens and are released with the owning preview asset. Canvas and Agent still treat variant URLs as opaque, short-lived runtime state; they persist only stable asset identity and preview descriptors. Canvas delegates panoramic nodes with double-click or the explicit preview button, while Agent panoramic cards remain idle thumbnails that open `neko-preview` on click.

Implementation note (2026-05-08): Canvas composable content consumes this boundary through preview
capabilities, not node-type preview branches. The Canvas Block + Container rollout in
`openspec/changes/canvas-block-container-architecture` persists only stable asset identity,
selected candidate state, and preview descriptors. Runtime variant URLs, object/blob URLs, engine
tokens, active playback handles, hover state, and current playback time remain owned by the Canvas
Webview/Extension preview runtime and must not be serialized into `.nkc`.

### Refinement: Panoramic Viewer Reuse Scope

`adr-panoramic-image-preview.md` states (line 140, 378, 392):

> 球面查看器组件需可被 neko-model（环境贴图编辑）、neko-canvas（全景背景节点）复用

> 球面查看器是否抽出独立 npm 包（`@neko/panorama-viewer`）供 neko-model / neko-canvas 复用？倾向是

This ADR **refines** that decision. "Reuse" means reusing the **protocol, preview assets, and command entry points** — not embedding the WebGL sphere renderer into canvas or agent webviews:

| Reuse type | Allowed | Example |
|------------|---------|---------|
| **Command entry point** | Yes | `vscode.commands.executeCommand('neko.preview.openPanoramicImage', uri)` or `vscode.openWith(uri, 'neko.preview.panoramicVideo')` |
| **Pre-rendered assets** | Yes | Engine-generated turntable mp4, center-crop thumbnails |
| **Shared types / contracts** | Yes | `ImageProbeInfo`, `projectionType` in `@neko/shared` |
| **`@neko/panorama-viewer` as iframe / webview panel** | Yes (neko-model only) | neko-model embeds the viewer as an environment map picker panel |
| **`@neko/panorama-viewer` WebGL component in canvas/agent** | No | Violates lightweight preview boundary |

neko-model may embed the sphere viewer for environment map editing (its WebGL context is already justified by R3F). Canvas and agent must not — they consume pre-rendered substitutes and delegate interactive viewing to neko-preview.

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

1. **SRP**: Canvas orchestrates, agent converses, preview views, editors edit. Adding interactive 3D/spherical rendering to canvas or agent would turn them into viewers, violating their single responsibility. Inline video/audio playback in agent is not "viewing" — it is **confirmation of generation results**, which is core to agent's conversational responsibility.

2. **Performance**: Canvas may display dozens of nodes simultaneously; DOM-native `<video>`/`<audio>` elements are hardware-accelerated and lightweight there. Agent chat history may contain many media cards, but only one can be in Active (playing) state at a time — idle cards are pure `<img>`, identical cost to the static-only design. WebGL contexts are not lightweight — multiple GL contexts on one page is a known browser bottleneck, prohibited in both surfaces.

3. **Dependency rules**: The `no-cross-extension-deps` constraint means any extension needing panoramic preview cannot depend on neko-model. A standalone viewer in neko-preview keeps the dependency graph clean. Agent and canvas both delegate to neko-preview for professional viewing without knowing about each other. Agent's inline playback uses `@neko/neko-client` (a shared Layer 0 package), not a cross-extension import.

4. **Consistency**: All canvas nodes follow the same pattern (thumbnail → hover preview → double-click delegate). All agent media cards follow the same two-state pattern (idle poster → click to play inline → click to open full viewer). No special rendering for any single asset type in either surface.

5. **Dynamic preview via pre-rendering**: For asset types that cannot be streamed via neko-client (3D, skeletal, panoramic), the engine pre-renders turntable videos or GIFs. Canvas and agent consume the same pre-rendered assets — no duplication at the rendering layer.

6. **Context-appropriate thumbnails**: The same asset type may warrant different thumbnail strategies in different surfaces. Canvas has spatial room for full equirectangular projections; agent chat cards are compact and need immediately comprehensible crops. The engine provides both variants; the consuming surface picks the appropriate one.

7. **Iteration efficiency**: Agent's generate→confirm→iterate loop is the dominant workflow. Every context switch (chat → preview panel → chat) costs ~3-5 seconds of orientation time. With inline playback, users confirm results in-place; with static-only cards, each confirmation round-trip adds two context switches. Over a multi-round generation session this compounds significantly.

## Consequences

### Positive

- Clear ownership: each plugin knows exactly what it is responsible for
- Canvas and agent both stay lightweight when idle (pure `<img>` thumbnails) regardless of asset diversity
- New asset types follow the same pattern in both surfaces: add thumbnail variant + delegate command
- No WebGL in canvas or agent webview = simpler CSP, fewer GPU resource conflicts
- Pre-rendered preview assets are generated once by the engine and consumed by both canvas and agent
- Agent gets panoramic previews "for free" via the same engine pipeline that serves canvas
- Agent inline playback eliminates context-switch friction in the generate→confirm→iterate loop
- `ablation:agent-inline-playback` toggle allows graceful degradation to static-only mode

### Negative

- Pre-rendered dynamic thumbnails require engine support (turntable render, panorama rotation capture, center-crop FOV extraction)
- Users cannot interactively explore 3D/panoramic assets without opening another editor — applies to both canvas and agent
- Two-step workflow for "quick look" at 3D/panoramic content (canvas/agent → preview/editor)
- Agent requires an additional thumbnail variant (center-crop FOV) that canvas does not need
- Agent webview gains `@neko/neko-client` as a dependency (+~54KB source, tree-shaken to H264StreamClient + AudioStreamClient + FrameScheduler)
- Agent inline playback component (`InlineChatPlayer`) needs maintenance parity with canvas's `InlineMediaPlayer` — consider extracting shared playback logic to `@neko/neko-client` if divergence becomes costly

### Neutral

- Engine IBL pipeline is shared between neko-preview and neko-model; no duplication at the Rust layer
- Agent and canvas consume the same pre-rendered mp4/GIF for turntable/rotation previews; the only difference is the static thumbnail strategy (full projection vs center crop)
- 360° video receives no special treatment in either surface — spherical playback is exclusively neko-preview's responsibility
- Agent inline playback uses the same WebSocket streaming path as canvas (webview → direct WS to neko-preview frame server); extension host brokers stream start/stop and owns engine-side cleanup
