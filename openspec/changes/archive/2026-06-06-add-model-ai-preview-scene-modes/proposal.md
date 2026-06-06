## Why

AI face and character creation needs a fast, repeatable way to judge whether a generated character is actually usable. Today users can tweak face parameters, but they still have to manually orbit, frame, play actions, and test voice/lip sync to catch common issues such as face detail drift, body proportion mismatch, skinning artifacts, clipping, and voice-expression mismatch.

This change adds semantic preview scene modes for Neko Model AI character authoring so users can quickly switch between face, full body, motion, and voice pack evaluation without reintroducing the deleted generic top viewport toolbar.

## What Changes

- Add an AI character preview mode contract with four initial modes: `face`, `full-body`, `motion`, and `voice-pack`.
- Add a compact mode selector for AI character authoring surfaces that coordinates camera preset, framing, lighting/render preset, preview overlays, and optional playback content.
- Route preview mode changes through the existing engine scene-control WebSocket path, not Extension Host or HTTP camera fallbacks.
- Preserve manual camera adjustments per mode and provide a reset-to-preset behavior without replacing existing orbit/navigation controls.
- Add engine-owned preview orchestration for mode presets, animation demo clips, voice pack playback, viseme/mouth-shape checks, and degraded states when required assets are unavailable.
- Add diagnostics so each mode can report missing voice packs, missing demo clips, unsupported rig bindings, stale revisions, and preview fallback status.
- Keep the UI scoped to the AI character preview workflow and do not restore the removed horizontal `ViewportToolbar` in Neko Model.

## Capabilities

### New Capabilities

- `model-ai-preview-scene-modes`: Defines semantic preview modes for AI character authoring, including mode selection, preset orchestration, per-mode camera overrides, playback assets, and diagnostics.

### Modified Capabilities

- `character-authoring-workflows`: AI character authoring gains a preview/evaluation workflow for face, full-body, motion, and voice pack checks.
- `webview-engine-control-surface`: Preview mode commands and events must use direct Webview-to-engine scene-control WebSocket routing and stay out of Extension Host high-frequency paths.
- `engine-render-viewport`: Render frame metadata and viewport state must expose enough mode identity and revision alignment for preview overlays and playback diagnostics.

## Impact

- Affected contracts include shared TypeScript/Rust DTOs for preview mode ids, mode requests, mode state, diagnostics, and scene-control payload guards.
- Affected Neko Model Webview code includes AI character panels, Zustand state, `ModelController`, `VideoViewport`/`ViewportShell` integration, and tests that assert no top horizontal viewport toolbar is restored.
- Affected engine code includes scene-control routing, preview preset application, camera/framing state, demo animation playback, voice pack/audio stream coordination, viseme/expression synchronization, and render metadata emission.
- Affected media clients include direct scene-control WebSocket command flow plus optional audio stream handling for voice pack preview.
- Documentation should describe the preview modes as AI character evaluation scenes, not as a generic camera toolbar replacement.
