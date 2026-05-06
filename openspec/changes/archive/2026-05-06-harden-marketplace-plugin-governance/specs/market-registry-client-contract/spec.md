## ADDED Requirements

### Requirement: Plugin build requests are authenticated and user-scoped by server
The market client SHALL call plugin build endpoints using Bearer authentication and MUST NOT send user identity as an authoritative request-body field. Server-side build cache identity is derived from authenticated user, plugin id, version, target triple, and session data.

#### Scenario: Commercial plugin build is requested
- **WHEN** installing a Tier A or Tier S commercial plugin that requires per-user build
- **THEN** the client calls `POST /api/v1/plugins/:id/build` with version, target triple, and session id
- **THEN** user identity is supplied by the Authorization header rather than a `userId` body field

#### Scenario: Build enters asynchronous path
- **WHEN** the plugin build response returns a queued build id
- **THEN** the client polls build status using the documented build status endpoint
- **THEN** it obtains the build result only after the server reports the build as done

### Requirement: Publisher verification APIs remain server-owned
The market client SHALL treat publisher verification as a registry or Publisher Portal workflow. Client code MUST NOT approve publisher verification locally, persist KYC documents, or synthesize verified badges.

#### Scenario: Publisher submits verification
- **WHEN** a publisher starts verification from the client surface
- **THEN** the client opens the server-owned portal or calls the verification submission endpoint with authenticated transport
- **THEN** the verification status remains pending until the server returns an approved status

#### Scenario: Verification badge is displayed
- **WHEN** package detail includes `distribution.publisher.verified = true`
- **THEN** the client may display the verified badge
- **THEN** absent or false verified status is not overridden by local cache or display name

### Requirement: Permission violation audit is reported without sandbox claims
The market or engine client SHALL report host-api permission violations to the registry audit endpoint when available. The report MUST identify the plugin, declared violation, and timestamp, and MUST NOT claim coverage for direct native syscalls.

#### Scenario: Host-api violation is reported
- **WHEN** engine audit detects a plugin host-api permission violation
- **THEN** the client sends `POST /api/v1/audit/permission-violation` with plugin id, permission, declared=false, and timestamp
- **THEN** purchaser and session identifiers are included when available from watermark or entitlement context

#### Scenario: Audit endpoint is unavailable
- **WHEN** the registry does not advertise plugin audit capability or the endpoint fails transiently
- **THEN** the client keeps a local audit record or retryable telemetry item according to retention policy
- **THEN** plugin permission UI still describes the audit boundary accurately

### Requirement: Entitlement and license checks for plugins remain server-driven
The market client SHALL retrieve entitlement and authorization data from registry endpoints and pass it to install or engine layers as server-owned state. Client code MUST NOT compute plugin license validity from local price, manifest fields, or payment UI state.

#### Scenario: Plugin entitlement is checked before build or download
- **WHEN** a paid plugin install starts
- **THEN** the client checks entitlement through the registry before requesting a build or download descriptor
- **THEN** build or download is not requested when entitlement is denied

#### Scenario: Engine refreshes plugin entitlement
- **WHEN** the engine requires a fresh plugin license decision before loading
- **THEN** the request is made through the configured registry/auth adapter
- **THEN** TypeScript-side UI state cannot mark the license as allowed without server authorization
