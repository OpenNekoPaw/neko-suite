## ADDED Requirements

### Requirement: Semantic Coverage Uses A Shared DTO Contract
The system SHALL define shared semantic coverage contracts for querying semantic evidence coverage by stable source reference, optional range, analysis kind, and optional version/provider hints. The contracts MUST include coverage status, freshness, matched ranges, stale reasons, diagnostics, and provider/schema metadata without exposing cache file paths or provider-private payloads.

#### Scenario: Consumer queries coverage for a document range
- **WHEN** a consumer submits a semantic coverage query with `sourceRef`, `range`, and `analysisKind`
- **THEN** the query is validated through shared guards and routed through a host-mediated facade
- **THEN** the result reports `fresh`, `stale`, `missing`, `partial`, or `failed` coverage with freshness metadata

#### Scenario: Invalid range is rejected by shared guards
- **WHEN** a semantic coverage query includes a range field incompatible with the source reference kind
- **THEN** shared validation reports a diagnostic rather than allowing the consumer to read semantic sidecar files directly

### Requirement: Semantic Coverage Preserves Cache Boundaries
The system SHALL return semantic coverage as host-mediated DTOs and MUST NOT expose `.neko/.cache`, `.neko/semantic-index`, SQLite, FTS, vector-store paths, Webview URIs, scratch paths, base64 payloads, or provider runtime handles to Agent or Webview consumers.

#### Scenario: Agent receives coverage without cache schema
- **WHEN** Agent queries semantic coverage for a comic page range
- **THEN** the response includes stable source refs, matched ranges, freshness, stale reasons, and diagnostics
- **THEN** the response does not include local cache manifests, sidecar file paths, database row ids, Webview URIs, or scratch paths

#### Scenario: Missing coverage remains actionable
- **WHEN** no semantic evidence exists for a requested range
- **THEN** the response reports `missing` coverage and preserves enough source/range information for Agent to analyze that range through normal tools

### Requirement: Semantic Coverage Supports Incremental Range Planning
The system SHALL provide enough range coverage information for a consumer to reuse fresh semantic evidence and analyze only missing or stale ranges.

#### Scenario: Fresh earlier pages are reused
- **WHEN** pages 1-10 of a document have fresh semantic evidence and pages 11-20 have no semantic evidence
- **THEN** a coverage query for pages 1-20 returns matched ranges for pages 1-10 and `missing` or `partial` coverage for pages 11-20
- **THEN** the consumer can plan analysis for pages 11-20 without reanalyzing pages 1-10

#### Scenario: Stale evidence reports reasons
- **WHEN** a matched semantic evidence range was produced with an outdated provider, schema version, source fingerprint, or skill version
- **THEN** the coverage result reports `stale` or `partial` coverage with stale reason codes and relevant provider/schema metadata

### Requirement: Semantic Coverage Does Not Confirm Facts
The system SHALL treat semantic coverage results as evidence availability and freshness information only. Coverage results MUST NOT confirm entities, accept character observations, update entity bindings, or mutate original media metadata.

#### Scenario: Coverage hit includes entity evidence
- **WHEN** a semantic coverage result contains matched ranges with entity mention or character observation evidence
- **THEN** the evidence remains draft, reviewable, accepted, rejected, conflict, or superseded according to its source ledger
- **THEN** the coverage query itself does not change review status or confirmed entity facts
