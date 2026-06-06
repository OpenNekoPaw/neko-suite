## Live Compositor Parity Cleanup Notes

Date: 2026-05-21

### Latency Smoke Coverage

- Rust stream lifecycle smoke tests cover compositor stream startup, `RenderFrameMeta` emission, scene revision propagation, and command `appliedSeq` reconciliation after `scene:live:*` acks.
- Synthetic compositor frame metadata includes render/encode diagnostic fields where the engine path can report them in this pass.
- Browser-side decode and presentation timing are not yet authoritative in automated CI because they require a WebCodecs-capable Webview/runtime target. The default live scene therefore keeps `decode` latency marked unavailable until the H.264 client can report real samples.
- Tracking-to-frame latency remains a parity gate for removing the local renderer because high-frequency tracking does not yet feed the compositor directly in a measured end-to-end loop.

### Fallback Isolation

- neko-live now routes normal visual truth through `ViewportShell` and `LiveController` when the compositor stream is active.
- Local R3F/Puppet renderers are mounted only through `LiveLocalFallbackSurface`, which marks the DOM path with `data-authority="local-fallback"` and displays the non-authoritative fallback diagnostic.
- Webview canvas recording continues to send `authority: "local-fallback"` until compositor recording is implemented.

### Cleanup Boundary

- No persistent live renderer deletion is performed in this pass because decode/presentation and tracking-to-frame latency gates are still unavailable.
- Duplicated live toolbar/output/layer control behavior has moved into `LiveController`; duplicated local avatar rendering remains only behind the explicit fallback surface.
- `implement-unified-viewport-protocol` remains archiveable with live compositor parity owned by this change.
