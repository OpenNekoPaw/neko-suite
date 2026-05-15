## Context

Preview routes currently own both domain logic and transport. The ADR separates preview into `runtime-media` for no-GPU media analysis, `engine-kernel` for provider orchestration, and `host-http` for file transport. This change covers PR6a/PR6b only; GPU PanoramicRenderer is intentionally later.

## Goals / Non-Goals

**Goals:**

- Move CPU preview analysis into `runtime-media`.
- Add preview provider registry contracts.
- Migrate JSON preview commands to ActionRouter under `previews`.
- Preserve direct HTTP routes for Range file and EPUB transport.
- Keep existing preview behavior stable during migration.

**Non-Goals:**

- Implement PanoramicRenderer GPU FOV crop.
- Implement video, scene, or puppet GPU preview providers.
- Change webview file access security rules.
- Remove transport routes that serve binary/Range content.

## Decisions

### Runtime-Media Owns CPU Analysis

GPANO detection, sidecar metadata, thumbnail/proxy generation, and HDR detection move to runtime-media because they are no-GPU media domain logic.

Alternatives considered:

- Keep logic in host-http. Rejected because it mixes transport and domain behavior.

### JSON Commands Use ActionRouter

Preview asset registration, variant requests, metadata updates, token registration, and unregister operations move to `previews:*` actions.

Alternatives considered:

- Keep JSON preview operations as direct HTTP routes. Rejected because it bypasses N-API dispatch and plugin interception.

### File Serving Remains HTTP

Range file serving and EPUB path access remain direct HTTP routes because they are binary transport operations, not JSON commands.

Alternatives considered:

- Route binary file serving through ActionRouter. Rejected because it does not match request/response JSON semantics.

## Risks / Trade-offs

- [Risk] TS client migration breaks preview registration -> Mitigation: migrate client methods with parity tests and optionally keep temporary HTTP aliases.
- [Risk] Runtime-media grows too broad -> Mitigation: keep provider orchestration in engine-kernel and only move no-GPU analysis.
- [Risk] Token/file serving ownership blurs -> Mitigation: document host-http as transport-only for Range and EPUB routes.

## Migration Plan

1. Extract CPU preview analysis modules into runtime-media.
2. Update host-http preview routes to delegate analysis.
3. Add preview provider registry contracts and initial image/document providers.
4. Add `PreviewsController` and register it in ActionRouter.
5. Migrate TS `EngineClient` preview JSON calls to dispatch.
6. Keep binary file serving routes unchanged.
7. Roll back by retaining temporary HTTP aliases while fixing dispatch clients.
