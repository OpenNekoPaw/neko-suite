## 1. Contract Foundation

- [x] 1.1 Add shared live compositor DTOs for scene, layer, source ref, preset, tracking overlay, output route, diagnostics, revision, and latency sample data in `@neko/shared` without DOM/React/VSCode dependencies.
- [x] 1.2 Add runtime guards and JSON fixtures for live compositor scenes, layer commands, output routes, unsupported-source diagnostics, and latency diagnostics.
- [x] 1.3 Add Rust `engine-types` mirrors for live compositor DTOs with serde round-trip and fixture parity tests against TypeScript fixtures.
- [x] 1.4 Add `scene:live:*` payload guard extension points while keeping generic ViewportProtocol DTOs domain-independent.

## 2. Engine Compositor Scene Routing

- [x] 2.1 Add a live compositor controller route in ActionRouter for creating, updating, querying, and resetting live compositor scenes.
- [x] 2.2 Implement revision-aware `scene:live:set-preset`, `scene:live:update-layer`, `scene:live:reorder-layer`, and `scene:live:set-tracking-overlay`, and `scene:live:set-output-route` command handling.
- [x] 2.3 Add stale revision, unsupported protocol version, unsupported source, and unavailable output route rejection tests.
- [x] 2.4 Emit ViewportProtocol ack/error events with live scene revision and command sequence information.

## 3. Engine Compositor Stream

- [x] 3.1 Implement a synthetic-layer live compositor stream producer that returns an existing `RenderStreamDescriptor` and registers with `StreamRegistry`.
- [x] 3.2 Emit `RenderFrameMeta` for live compositor frames with viewport id, live scene revision, applied sequence, timestamp, and compositor diagnostics.
- [x] 3.3 Reuse `GpuLayer` and compositor primitives for solid/background and overlay layers without adding live-specific branches inside generic compositor code.
- [x] 3.4 Add stream lifecycle tests for start, subscriber connect, frame metadata, command-applied frame reconciliation, stop, and cleanup.

## 4. Source Layer Adapters

- [x] 4.1 Add background/media/camera source adapter seams with authorized device/session refs and unsupported fallback diagnostics.
- [x] 4.2 Add puppet source adapter seam that can consume native/legacy puppet render output as a generic compositor layer or report explicit unsupported diagnostics.
- [x] 4.3 Add model/scene source adapter seam that can consume scene render output as a generic compositor layer or report explicit unsupported diagnostics.
- [x] 4.4 Add overlay/tracking diagnostic layer support with z-order, opacity, visibility, and transform handling.

## 5. Neko Live Controller And Webview Migration

- [x] 5.1 Implement `LiveController` as an `ISceneController` adapter in neko-live without importing model or puppet controller implementations.
- [x] 5.2 Add neko-live compositor stream startup, descriptor normalization, `H264StreamClient` consumption, and `ViewportShell` display path.
- [x] 5.3 Route live scene preset, layer routing, tracking overlay, and output controls through `LiveController` toolbar descriptors/domain panels and `scene:live:*` commands.
- [x] 5.4 Preserve local R3F/Puppet preview behind explicit non-authoritative fallback diagnostics when compositor stream is unavailable.
- [x] 5.5 Add Webview tests for compositor path rendering, fallback isolation, command envelope payloads, and no direct cross-package controller imports.

## 6. Device And Output Integration

- [x] 6.1 Connect authorized camera/device sessions from `LiveSessionService` to compositor source refs without Webview constructing sensitive device control URLs.
- [x] 6.2 Add output route capability diagnostics for monitor preview, recording, OBS virtual camera, and RTMP.
- [x] 6.3 Keep Webview canvas recording as local fallback only until compositor recording is implemented, and label fallback recordings as non-authoritative.
- [x] 6.4 Add tests for permission/capability failures and fallback recording diagnostics.

## 7. Parity Cleanup

- [x] 7.1 Run live compositor latency smoke tests covering command-to-frame, tracking-to-frame, encode/decode, and presentation timing where available.
- [x] 7.2 Remove or isolate persistent neko-live R3F/Puppet local rendering after compositor visual parity and latency gates pass.
- [x] 7.3 Remove duplicated stream/input/overlay/toolbar code from live/model/puppet Webviews only where `ViewportShell` and compositor parity make it redundant.
- [x] 7.4 Update `implement-unified-viewport-protocol` archive notes or follow-up docs to reference this change as the owner of live compositor parity.

## 8. Validation And Documentation

- [x] 8.1 Run focused TypeScript tests for shared compositor contracts, neko-client descriptor handling, `@neko/ui` integration if touched, and neko-live Webview/Extension paths.
- [x] 8.2 Run focused Rust tests for engine-types serde parity, live compositor ActionRouter routing, compositor stream lifecycle, and source adapter diagnostics.
- [x] 8.3 Run architecture boundary checks for L0 shared purity, Webview VSCode/Node import bans, and no model/puppet/live controller cross-imports.
- [x] 8.4 Update Chinese architecture/user documentation and affected English references after compositor behavior lands.
- [x] 8.5 Verify `openspec validate implement-live-compositor-stream --strict` passes.
