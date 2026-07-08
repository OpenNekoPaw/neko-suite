## Context

Neko Desktop currently exposes an `EngineViewportSummary` and registers a Workbench `viewport-session` contribution. The summary uses capability strings and lists non-authoritative Web surfaces, but it is not yet a reusable contract shared by Workbench Core, Desktop, VSCode, or future native hosts.

The architecture decision remains: professional media/model output truth belongs to `neko-engine` and a native/engine viewport path. Webviews provide controls, overlays, inspectors, and bounded previews; they are not the authoritative 10-bit/HDR/color/texture output truth.

This change is L2. It adds host-neutral DTOs and Desktop snapshot wiring, but does not change Rust engine APIs, Proto, media streams, native window embedding, or Webview rendering.

## Goals / Non-Goals

**Goals:**

- Define a host-neutral Engine viewport session contract.
- Separate output truth from control surfaces and non-authoritative projections.
- Validate `neko-engine` authority and reject Webview/canvas/WebCodecs/Electron projections as authoritative outputs.
- Project the contract into the existing Workbench `viewport-session` contribution.
- Extend Desktop viewport snapshots to include the structured contract.

**Non-Goals:**

- Do not implement native surface embedding, texture sharing, HDR output, or 10-bit color management.
- Do not alter Engine HTTP/WS/Proto contracts.
- Do not change VSCode Webview behavior in this slice.
- Do not make Webview `<video>`, canvas, or WebCodecs the output truth.

## Decisions

### Decision: Workbench Core owns the session contract

Workbench Core will define `WorkbenchEngineViewportSessionContract`, validation helpers, and a contribution projection helper. This keeps the authority model shared across Desktop and future hosts without importing Engine, Electron, DOM, or React code.

Alternative considered: keep the contract in Desktop. Rejected because VSCode, TUI diagnostics, and future native hosts need the same authority semantics.

### Decision: Output, controls, and projections are separate arrays

The session contract records:

- `output`: authoritative Engine-owned output target metadata.
- `controlSurfaces`: Webview/native controls that may send intents.
- `nonAuthoritativeProjections`: Webview/canvas/WebCodecs/Electron projections that can display previews but cannot claim output truth.

Alternative considered: keep one string capability list. Rejected because it cannot express the safety rule that a surface is useful but non-authoritative.

### Decision: Desktop summary embeds the session contract

Desktop will keep the existing `EngineViewportSummary` fields for renderer compatibility and add `session`. Workbench contribution generation reads from `summary.session`, while renderer UI can continue using availability/diagnostic fields.

Alternative considered: replace `EngineViewportSummary` entirely. Rejected because this change should not churn renderer state while the native viewport is still not implemented.

## Five-Layer Analysis

Responsibility:

- Workbench Core owns the contract, validation, and contribution projection.
- `neko-engine` remains the authoritative runtime owner.
- Desktop owns health probing and intent ack/rejection.
- Webviews own controls and UI projections only.

Dependency:

- Workbench Core stays host-neutral.
- Desktop may import Workbench Core contracts.
- No Rust/Proto dependency is added in this slice.

Interface:

- Session id is stable.
- Output owner/runtime is explicit.
- Control surfaces declare host and intent capability.
- Projections declare why they are non-authoritative.

Extension:

- Future native/Electron/Tauri hosts can add output target kinds without changing feature packages.
- Future EngineClient/Proto work can bind real session ids to this contract.

Testing:

- Workbench Core tests cover valid contracts, invalid authority, invalid authoritative Web projections, and contribution projection.
- Desktop tests cover unavailable/ready summaries and Workbench contribution generation from the session.

Proportionality:

- The contract is small because native viewport implementation is deferred.
- Capability strings remain for current UI display, but structured data becomes the canonical source.

Fail-visible behavior:

- Non-Engine authority, non-authoritative Web surfaces used as output truth, missing session ids, and unknown output target kinds fail in tests or return diagnostics.

## Risks / Trade-offs

- [Risk] Contract may be ahead of native viewport implementation. -> Mitigation: keep it descriptive and wire only Desktop health/Workbench projection now.
- [Risk] Existing renderer code still reads legacy summary fields. -> Mitigation: embed `session` while preserving current fields until renderer/native viewport migration.
- [Risk] Capability strings could continue to drift. -> Mitigation: Workbench contribution generation reads from `session.capabilities`.

## Migration Plan

1. Add Workbench Core session contract and tests.
2. Extend Desktop `EngineViewportSummary` with `session`.
3. Update Desktop fixture/runtime summary creation to build the session contract.
4. Update Workbench contribution projection to read the session.
5. Validate Workbench Core and Desktop focused tests.

Rollback: remove the `session` field and return Workbench viewport contribution generation to the previous summary fields. No durable user data is affected.

## Open Questions

- Which native output target should Desktop implement first: Electron WebContentsView/BrowserView, OS-native child surface, or a dedicated engine window handle?
- Should color pipeline/HDR fields eventually move to Proto once engine-side capabilities are negotiated?
