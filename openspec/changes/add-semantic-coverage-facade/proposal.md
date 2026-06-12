## Why

Long-form comic, document, video, and audio workflows need to reuse semantic evidence across Agent turns and sessions. Without a host-mediated semantic coverage facade, Agent must either repeat earlier page analysis or risk bypassing cache boundaries to discover which ranges are already fresh, stale, or missing.

## What Changes

- Add a semantic coverage facade contract that lets consumers query coverage by stable source reference, optional range, and analysis kind.
- Return coverage, freshness, matched ranges, stale reasons, provider/schema metadata, and diagnostics without exposing `.neko/.cache`, `.neko/semantic-index`, SQLite, FTS, or vector-store internals.
- Require Agent media workflows to query semantic coverage before long document, comic, video, or audio range analysis and to analyze only missing or stale ranges when fresh evidence exists.
- Define the implementation boundary for semantic sidecar projection so semantic sidecars, character evidence, entity bindings, and project facts flow through a neutral project index coordinator rather than multiple package-local watcher/indexer pipelines.
- No breaking changes to existing search or Agent APIs; compatibility adapters may continue to serve existing search while the new coverage facade is introduced.

## Capabilities

### New Capabilities

- `semantic-coverage-facade`: Host-mediated semantic coverage query contract and cache-boundary rules for range-based evidence reuse.

### Modified Capabilities

- `project-cache-search-service`: Add semantic coverage query/freshness requirements and single neutral index-coordinator boundary for semantic sidecar projections.
- `agent-skill-driven-media-workflows`: Require Agent/Skill workflows to query semantic coverage before long-range media/document analysis and submit new semantic contributions through host services.

## Impact

- Shared contracts in `packages/neko-types` for `SemanticCoverageQuery`, `SemanticCoverageResult`, coverage/freshness values, stale reasons, and diagnostics.
- `neko-search` core/host integration or an equivalent neutral host service exposes the coverage facade without importing Agent, Dashboard, Canvas, or Webview code.
- `neko-agent` consumes the facade through tool/host bridges and prompt/skill workflow guidance; it does not read cache files or own cache schemas.
- Semantic sidecar and search projection code aligns with `docs/architecture/adr-unified-entity-memory-semantic-index.md`, `project-cache-search-service.md`, and `adr-structured-data-persistence.md`.
