## ADDED Requirements

### Requirement: Plugin Load Gates Feed Activation Bridges
The system SHALL run native plugin trust, integrity, signature, entitlement, platform, and Workspace Trust load gates before any activation bridge registers plugin contributions.

#### Scenario: Load gate failure prevents registration
- **WHEN** a native plugin fails any required load gate
- **THEN** no activation bridge registers contributions for that plugin
- **THEN** the plugin remains inactive and the failure is audited

#### Scenario: Signature presence is not sufficient
- **WHEN** a native plugin manifest includes signature metadata
- **THEN** activation still requires a verifier result that proves the artifact matches the trusted signature and integrity data
- **THEN** mere presence of signature fields does not satisfy the load gate
