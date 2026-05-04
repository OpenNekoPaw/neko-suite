## ADDED Requirements

### Requirement: Boundary compatibility exceptions have lifecycle metadata
The system SHALL represent every runtime boundary compatibility exception with explicit lifecycle metadata. The metadata MUST include id, file, reason, owner, tracking reference, introduced date, expiration date or sunset milestone, replacement path, and severity after expiry.

#### Scenario: Guard reports exception metadata
- **WHEN** the boundary guard scans a file covered by a compatibility exception
- **THEN** the JSON output includes the exception id, owner, tracking reference, expiration metadata, replacement path, and current expiry status

#### Scenario: Exception without metadata fails self-test
- **WHEN** a compatibility exception is added without required lifecycle metadata
- **THEN** the guard self-test fails and reports the missing metadata fields

### Requirement: Expired compatibility exceptions fail the production guard
The system SHALL fail `pnpm check:agent-boundaries` when a compatibility exception is expired and its configured severity after expiry is failure. Test-only overrides MUST NOT be enabled in normal guard execution.

#### Scenario: Expired exception blocks validation
- **WHEN** a compatibility exception has an expiration date before the current validation date
- **THEN** the production guard fails and reports the expired exception id and replacement path

#### Scenario: Unexpired exception remains visible but allowed
- **WHEN** a compatibility exception has not expired
- **THEN** the production guard passes while still listing the exception in JSON output

### Requirement: Compatibility exception renewal is auditable
The system SHALL require renewed exceptions to update expiration metadata and provide a renewal rationale or tracking reference. Renewal MUST be visible in documentation or guard output.

#### Scenario: Renewed exception includes rationale
- **WHEN** an exception expiration is extended
- **THEN** the guard metadata includes a renewal rationale or updated tracking reference
