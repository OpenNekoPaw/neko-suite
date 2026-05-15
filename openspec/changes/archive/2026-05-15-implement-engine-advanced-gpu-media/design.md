## Context

This change groups P3 work that depends on earlier foundations. It should not start until sink-based output, MuxerSink, GPU budget, preview routing, PanoramicRenderer, and PuppetRenderer are stable. The goal is to connect high-value GPU workflows without destabilizing P0/P2 infrastructure.

## Goals / Non-Goals

**Goals:**

- Add panoramic video stream preview using HwAccelDecoder, PanoramicRenderer, and StreamSink.
- Add ScenePreviewProvider and PuppetPreviewProvider.
- Integrate PuppetRenderer with H.264 stream and export paths.
- Define ML GPU bridge interfaces for export-time use.
- Add transition-as-GpuEffect support for two-input transitions.

**Non-Goals:**

- Implement realtime 60fps ML effects.
- Add unsupported CPU bridge fallback for ML texture processing.
- Replace all existing preview UI in one step.
- Implement platform GPU interop for every backend in one PR if unsupported.

## Decisions

### Advanced Preview Providers Depend On Earlier Providers

Video, scene, and puppet providers plug into the existing `PreviewProviderRegistry` and reuse StreamSink or snapshot-style terminal readback.

Alternatives considered:

- Add direct HTTP preview routes for each advanced provider. Rejected because it bypasses the registry and ActionRouter design.

### Puppet Stream And Export Use Sinks

Puppet H.264 preview uses StreamSink; puppet export uses MuxerSink or composition through GpuExportPipeline.

Alternatives considered:

- Add puppet-specific encoders. Rejected because it duplicates output layer responsibilities.

### ML Bridge Is Export-Oriented

`MlGpuBridge` covers texture-to-ORT and ORT-to-texture for export or precomputed workflows. It must not introduce texture readback to CPU ONNX and upload as a hot path fallback.

Alternatives considered:

- CPU ONNX bridge in the render path. Rejected because it violates GPU residency and stalls.

### Transition As GPU Effect

Two-input transition effects extend the effect registry with a dedicated transition trait/variant while preserving existing sequential pass behavior where needed.

Alternatives considered:

- Keep transition separate forever. Rejected because composition such as transition-time blur needs a unified GPU scheduling model.

## Risks / Trade-offs

- [Risk] Platform GPU interop for ML bridge is fragmented -> Mitigation: gate implementations by platform and keep unsupported paths explicit.
- [Risk] Advanced preview providers compete with editing GPU work -> Mitigation: use GPU budget at transcode priority.
- [Risk] Puppet stream path changes webview assumptions -> Mitigation: keep JSON/debug stream available while H.264 becomes primary only where supported.
- [Risk] Transition trait complicates effect registry -> Mitigation: add a separate two-input trait rather than overloading single-input effects.

## Migration Plan

1. Add advanced preview providers behind registry.
2. Add panoramic video stream using existing renderer and sink contracts.
3. Add puppet H.264 stream and export integration.
4. Add ML GPU bridge traits and platform-gated implementations or explicit unsupported errors.
5. Add transition-as-effect support and migrate compatible transitions.
6. Roll back individual providers by unregistering them while leaving base preview routing intact.
