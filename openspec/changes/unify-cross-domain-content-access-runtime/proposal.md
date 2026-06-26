## Why

Canvas, Cut, Preview, Agent, Assets, Audio, Model, and future Sketch/PSD flows all need the same public rules for source resolution, permissions, transparent cache, Webview projection, and Engine source registration. Several packages already compose `HostContentAccessService`, `ResourceCacheService`, `LocalResourceAccessService`, and `EngineClient` locally, which risks divergent cache semantics and duplicated path policy.

## What Changes

- Introduce shared Extension Host content access runtime/factory APIs in `@neko/shared/vscode/extension` that compose content access, ingest, resource cache, local resource access, Engine source registration hooks, document/resource providers, generated asset providers, thumbnail/preview providers, and path resolver context.
- Make public rules centralized: path conversion, authorized roots, content/cache variant policy, Webview projection, Engine source target, diagnostics, and cache lifecycle are decided by shared services.
- Move domain-specific behavior into provider/adapter interfaces: Canvas nodes, Preview viewers, Cut timeline/proxy/export, Model GLB/texture/environment, Sketch PSD/raster/layer import, Assets thumbnail/metadata, and Agent tool/provider adapters.
- Define when callers should use `ContentAccessService`, when they may directly use `@neko/neko-client`, and when no cache is needed because the data is pure text/project fact or a user-selected final output.
- Replace package-local service assembly in Agent, Canvas, Cut, Preview, Assets, Audio, Model, and Sketch with shared runtime builders incrementally.
- Keep `ResourceCacheService` as the cache owner and `neko-engine` as binary/media source authority; do not make either layer own project facts.
- **BREAKING**: New cross-domain payloads and provider APIs must use stable refs and intent-based requests. Package-local cache path contracts and Webview URI fallback contracts are rejected for new paths.

## Capabilities

### New Capabilities

- `cross-domain-content-access-runtime`: Defines the shared Host content access runtime/factory, domain provider/adapter responsibilities, direct Engine client usage rules, and no-cache source rules across creative domains.

### Modified Capabilities

- None.

## Impact

- Affected shared packages:
  - `packages/neko-types/src/types/content-access.ts`
  - `packages/neko-types/src/vscode/extension/content-access-service.ts`
  - `packages/neko-types/src/vscode/extension/content-access-providers.ts`
  - `packages/neko-types/src/vscode/extension/resource-cache-service.ts`
  - `packages/neko-types/src/vscode/extension/resource-cache-providers.ts`
  - `packages/neko-types/src/vscode/extension/local-resource-access.ts`
  - `packages/neko-client/src/EngineClient.ts`
- Affected domain packages:
  - `neko-agent`, `neko-canvas`, `neko-cut`, `neko-preview`, `neko-assets`, `neko-audio`, `neko-model`, `neko-sketch`, and possibly `neko-tools`.
- Non-goals:
  - Do not convert every media playback component to a single UI player in this change.
  - Do not make Webviews read local files or cache manifests directly.
  - Do not route pure text/project fact reads through Engine.
  - Do not redesign all domain project formats.
  - Do not introduce a remote/cloud/distributed file service.
