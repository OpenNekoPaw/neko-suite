## 1. Shared Contracts

- [x] 1.1 Add shared semantic coverage DTO types, coverage/freshness values, analysis kinds, stale reason codes, and provider metadata fields in `packages/neko-types`.
- [x] 1.2 Add type guards and validators for `SemanticCoverageQuery` and `SemanticCoverageResult`, reusing existing media semantic source/range validation.
- [x] 1.3 Export semantic coverage contracts from the shared public barrel used by Agent, search, and host integrations.
- [x] 1.4 Add unit tests covering valid queries, invalid range/source combinations, stale reason validation, diagnostics, and rejection of cache paths or runtime handles.

## 2. Search Core And Provider Boundary

- [x] 2.1 Add a neutral semantic coverage provider interface in `neko-search` core that consumes shared DTOs and returns shared results.
- [x] 2.2 Implement deterministic coverage aggregation for multiple provider results, including fresh, stale, missing, partial, and failed outcomes.
- [x] 2.3 Preserve source refs, matched ranges, freshness, stale reasons, provider/schema metadata, and diagnostics in aggregated results.
- [x] 2.4 Add core tests for coverage merging, stale provider metadata, missing ranges, partial ranges, and provider failure isolation.

## 3. Host Facade

- [x] 3.1 Expose a VSCode host-mediated semantic coverage command or adapter through `@neko/search/host-vscode`.
- [x] 3.2 Resolve project context using existing project search context resolution before routing coverage queries.
- [x] 3.3 Ensure the host facade never returns `.neko/.cache`, `.neko/semantic-index`, SQLite, FTS, vector-store paths, Webview URIs, scratch paths, base64, or provider-private payloads.
- [x] 3.4 Add host integration tests or boundary tests proving Agent/Webview consumers do not read semantic sidecar or cache files directly.

## 4. Agent Consumption

- [x] 4.1 Add an Agent-side adapter/tool bridge that calls the semantic coverage facade and returns structured coverage diagnostics.
- [x] 4.2 Update long-range media workflow planning helpers to query semantic coverage before analyzing document, comic, video, or audio ranges when stable source refs are available.
- [x] 4.3 Ensure Agent reuses fresh matched ranges as context and schedules tool analysis only for missing or stale ranges.
- [x] 4.4 Ensure missing stable source refs degrade with an explicit diagnostic and normal tool-based analysis.
- [x] 4.5 Add Agent tests proving fresh pages are not reanalyzed, missing/stale pages are analyzed, and coverage results do not mutate confirmed entities or accepted observations.

## 5. Skill And Artifact Guidance

- [x] 5.1 Update relevant media workflow skill text to instruct semantic coverage query before expensive long-range analysis.
- [x] 5.2 Ensure skill manifests remain deterministic hints only and do not introduce route DAGs, cache file readers, or workflow execution schemas.
- [x] 5.3 Ensure new semantic evidence from missing/stale analysis is emitted as structured contribution/artifact payloads with source refs, ranges, confidence, and provenance.
- [x] 5.4 Add focused skill regression tests proving semantic coverage guidance does not create a fixed TypeScript media route.

## 6. Projection Coordination And Quality Gates

- [x] 6.1 Document or implement the initial project index coordination boundary for semantic sidecar, character evidence, entity binding, and project fact projections.
- [x] 6.2 Add tests or guards preventing multiple package-local watcher/indexer pipelines from exposing conflicting semantic cache schemas to consumers.
- [x] 6.3 Run focused tests for `neko-types`, `neko-search`, and `neko-agent` coverage changes.
- [x] 6.4 Run repository quality review for architecture boundaries, especially Agent not owning cache schemas and Webviews not reading local cache files.
