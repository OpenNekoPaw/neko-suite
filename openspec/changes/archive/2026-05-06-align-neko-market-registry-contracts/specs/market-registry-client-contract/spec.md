## ADDED Requirements

### Requirement: Registry client uses API v1 base contract

The market client SHALL call Registry API v1 over HTTP JSON using a configurable registry URL. Requests MUST send JSON accept headers, MAY send Bearer auth, and MUST treat RFC 7807 Problem Details as structured errors.

#### Scenario: Default official registry URL is used

- **WHEN** no registry URL is configured
- **THEN** the client uses `https://market.neko.dev/api/v1`
- **THEN** every relative endpoint path is resolved under that base URL

#### Scenario: Private registry URL is configured

- **WHEN** `neko.market.registryUrl` is set by the workspace or user
- **THEN** the client uses the configured URL
- **THEN** the extension does not hardcode the official registry for subsequent calls

#### Scenario: Problem Details response becomes typed error

- **WHEN** the registry returns an error response with `Content-Type: application/problem+json`
- **THEN** the client exposes status, title, detail, type, instance, and extension fields to callers
- **THEN** UI surfaces can render a retry or blocked state without parsing plain text

### Requirement: Auth token is injected by host adapter

The market extension SHALL obtain auth state from `neko-auth` and inject it into `MarketClient` as a Bearer token. Market core MUST remain host-agnostic and MUST NOT import VSCode or `neko-auth`.

#### Scenario: Session exists at startup

- **WHEN** the market extension activates and `neko-auth` has a valid session
- **THEN** `MarketClient.setAuthToken(token)` is called
- **THEN** subsequent HTTP requests include `Authorization: Bearer <token>`

#### Scenario: Session changes

- **WHEN** `neko-auth` reports a session change
- **THEN** the market extension refreshes the client auth token
- **THEN** requests after logout no longer include the previous Authorization header

### Requirement: Search supports registry discovery filters

The market client SHALL support package discovery query parameters for text, types, category, tags, visibility, pricing, publisher, sort, order, semantic facets, intent facets, vector search, limit, offset, and cursor. P0 UI flows MUST support `featured` and `created` sorting.

#### Scenario: Featured browse query is sent

- **WHEN** the Browse view requests the recommended segment
- **THEN** the client calls `/packages` with `sort=featured`
- **THEN** the result is parsed as a package list response with `items`, `total`, `hasMore`, and optional `nextCursor`

#### Scenario: Created browse query is sent

- **WHEN** the Browse view requests the latest segment
- **THEN** the client calls `/packages` with `sort=created`
- **THEN** pagination parameters are preserved in the registry query

#### Scenario: Semantic and intent facets are encoded

- **WHEN** search includes semantic and intent filters
- **THEN** semantic filters are encoded under `semantic.<facet>`
- **THEN** intent filters are encoded under `intent.<field>`
- **THEN** the client does not convert unknown ontology values locally

### Requirement: Package detail returns final manifest

The market client SHALL treat `GET /api/v1/packages/:id` as the source of a complete server-produced package detail. The client MUST NOT assemble, sign, mutate, or augment the manifest with user-specific entitlement data.

#### Scenario: Detail package is found

- **WHEN** the registry returns package detail for an id
- **THEN** the client exposes `id`, `manifest`, `installState`, and optional `installedVersion`
- **THEN** the manifest is passed through as the server final shape

#### Scenario: Detail package is missing

- **WHEN** the registry returns 404 for package detail
- **THEN** `getPackage` returns an absent result or typed not-found state
- **THEN** callers can render a not-found state without treating it as a transport failure

### Requirement: Version and featured responses use server envelopes

The market client SHALL parse package versions from the server `versions` envelope and featured packages from the server `items` envelope. It MUST NOT assume bare arrays for v1 responses.

#### Scenario: Versions endpoint returns envelope

- **WHEN** `GET /packages/:id/versions` returns `{ versions: [...] }`
- **THEN** the client returns version entries containing version, release time, compatibility, download size, changelog, and deprecation where present

#### Scenario: Featured endpoint returns envelope

- **WHEN** `GET /featured` returns `{ items: [...] }`
- **THEN** the client exposes the item list to Browse
- **THEN** optional type filtering is encoded as a query parameter

### Requirement: Download descriptors preserve integrity metadata

The market client SHALL retrieve download descriptors containing URL, expiration, size, integrity, and resumable fields. Install runtime MUST verify descriptor integrity against the manifest or reject the download.

#### Scenario: Archive download URL is requested

- **WHEN** installing an archive package version
- **THEN** the client calls `/packages/:id/versions/:ver/download`
- **THEN** it returns a descriptor rather than only a URL string

#### Scenario: Download descriptor integrity mismatches manifest

- **WHEN** a registry-source manifest has integrity `A` but the download descriptor has integrity `B`
- **THEN** installation fails before staging
- **THEN** the client reports an integrity contract violation

### Requirement: Large asset download endpoints are modeled

The market client SHALL model sparse manifest, sparse selection reporting, variant download, proxy variant download, and delta download endpoints. Unsupported server capabilities MUST be detected before calling optional endpoints.

#### Scenario: Sparse manifest is requested

- **WHEN** a package uses sparse large asset mode and the server advertises sparse support
- **THEN** the client calls `/packages/:id/sparse-manifest`
- **THEN** it parses sparse items and total size

#### Scenario: Server lacks delta capability

- **WHEN** a package advertises delta mode but `GET /version` does not include delta support
- **THEN** the client does not call `/packages/:id/delta`
- **THEN** installation falls back to an available full download path or reports unsupported mode

### Requirement: Entitlement and billing are server-driven

The market client SHALL list entitlements, sync entitlement changes, refresh entitlements, check install authorization, and obtain checkout URLs from the registry. Client code MUST NOT compute paid access locally and MUST NOT store payment credentials or order state.

#### Scenario: Paid install is checked before download

- **WHEN** installing a paid package
- **THEN** the client calls `/me/entitlements/check` with package id and version
- **THEN** download does not start unless the server response allows installation

#### Scenario: Checkout URL opens externally

- **WHEN** the user chooses to buy or renew a package
- **THEN** the extension requests `/billing/checkout-url`
- **THEN** the resulting URL is opened with the VSCode external browser mechanism
- **THEN** no payment fields are rendered or collected inside the webview

#### Scenario: Entitlement changes use ETag

- **WHEN** the client has a previous entitlement ETag
- **THEN** it calls `/me/entitlements/changes` with `If-None-Match`
- **THEN** a `304 Not Modified` response keeps the current entitlement cache

### Requirement: Ontology and curation endpoints feed client display

The market client SHALL fetch semantic ontology, intent ontology, and package deprecation data from the registry. The client MUST use ontology responses for facet UI and MUST treat deprecation as display/status metadata rather than local deletion authority.

#### Scenario: Semantic ontology populates filters

- **WHEN** Browse needs facet filters for a selected type and kind
- **THEN** the client requests `/ontology/semantic`
- **THEN** enum, range, set, and string fields are presented from the server schema

#### Scenario: Deprecation does not uninstall package

- **WHEN** `/packages/:id/deprecation` returns a deprecation record
- **THEN** the installed status can become deprecated
- **THEN** the package remains usable unless another status such as expired or incompatible blocks it

### Requirement: Server capability probe controls optional behavior

The market client SHALL probe server version and capabilities before using optional endpoints or fields. Missing capabilities MUST produce graceful degradation rather than request storms or broken UI.

#### Scenario: Capability probe succeeds

- **WHEN** the client starts or registry URL changes
- **THEN** it calls `GET /api/v1/version`
- **THEN** it records server version and capability identifiers for later feature checks

#### Scenario: Capability probe fails

- **WHEN** the version endpoint is unavailable on a registry
- **THEN** the client assumes only P0 discovery, detail, versions, download, and entitlement check behavior
- **THEN** P1/P2 UI controls are hidden or disabled

### Requirement: Cache and rate-limit behavior follows registry contract

The market client SHALL honor HTTP cache headers and local TTL policy for discovery, detail, versions, entitlements, ontology, and featured responses. It MUST implement retry/backoff behavior for rate limits and transient long-operation failures.

#### Scenario: Rate limited response includes retry header

- **WHEN** the registry returns `429 Too Many Requests` with `Retry-After`
- **THEN** the client delays retry according to the header and exponential backoff policy
- **THEN** the UI exposes a retryable throttled state

#### Scenario: Ontology cache survives restart

- **WHEN** ontology data was fetched successfully
- **THEN** the client may persist it for the documented TTL
- **THEN** Browse can render known facet filters during a later startup while refreshing in the background
