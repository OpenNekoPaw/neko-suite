## 1. Shared Runtime Contract

- [x] 1.1 Audit Agent, Canvas, Cut, Preview, Assets, Audio, Model, Sketch, and Tools for package-local content access, cache, path conversion, Webview projection, Engine source registration, thumbnail, proxy, and metadata cache assembly.
- [x] 1.2 Define shared Host content runtime/factory interfaces in `@neko/shared/vscode/extension` for local resource access, resource cache, content access, content ingest, Webview resolver, Engine source registration, and provider registration.
- [x] 1.3 Add tests for factory creation, provider registration, fail-visible missing provider diagnostics, Webview resolver scoping, and duplicate provider replacement.

## 2. Shared Providers and Boundaries

- [x] 2.1 Extend or reuse shared providers for source file, resource cache, document entry, generated output, thumbnail, preview variant, video proxy, and export staging paths.
- [x] 2.2 Add shared diagnostics for unsupported source, unsupported destination, unauthorized root, non-portable resource, projection failure, missing Engine source resolver, and cache materialization failure.
- [x] 2.3 Document and test the direct Engine client rule: content access resolves/authorizes sources; `@neko/neko-client` performs Engine-owned stream/compute operations.

## 3. Domain Migrations

- [x] 3.1 Migrate Agent Extension content runtime assembly to the shared factory while preserving Agent-specific typed runtime methods.
- [x] 3.2 Migrate Canvas resource cache/content access assembly and preview variant projection to the shared factory with Canvas providers.
- [x] 3.3 Migrate Cut source resolution, export staging, proxy, thumbnail, and timeline media access composition to shared content access providers.
- [x] 3.4 Migrate Preview document/media provider setup so document page/entry resources, image projection, and media preview variants use shared services.
- [x] 3.5 Migrate Assets thumbnail/metadata/media-library root integration into shared providers or explicitly classify remaining caches as domain facts or bounded runtime caches.
- [x] 3.6 Add Model providers for GLB/GLTF/VRM source refs, sibling textures, environment images, and model preview variants.
- [x] 3.7 Add Sketch providers for PSD/raster source refs, reference images, generated art, and layer preview variants.

## 4. Legacy Removal and Guardrails

- [x] 4.1 Remove or quarantine package-local cache/path/projection builders that duplicate shared runtime rules after each domain migration.
- [x] 4.2 Add boundary checks preventing new package-local cache managers, path resolvers, raw Webview URI fallbacks, or Engine HTTP clients in feature packages where shared services exist.
- [x] 4.3 Update architecture docs and package boundary docs with final shared runtime usage rules and remaining intentionally local caches.

## 5. Validation

- [x] 5.1 Run shared content-access/resource-cache/local-resource-access tests.
- [x] 5.2 Run focused tests for each migrated domain package.
- [x] 5.3 Run TypeScript checks for affected shared and domain packages.
- [x] 5.4 Run boundary and debt checks covering package-local cache/path/projection duplication.
- [x] 5.5 Run `openspec validate unify-cross-domain-content-access-runtime`.
