## ADDED Requirements

### Requirement: Runtime-sensitive client changes require functional acceptance
Changes to Extension Webview or Desktop behavior SHALL provide real host functional evidence proportional to the affected user path; build, target, JSDOM, and browser-only evidence MUST remain supplemental.

#### Scenario: Extension Webview interaction changes
- **WHEN** a change modifies Extension Webview interaction, messaging, focus, persistence, CSP-sensitive resources, media behavior, or lifecycle
- **THEN** validation MUST execute a focused real Extension Development Host functional scenario that operates the affected UI and verifies its authoritative result and runtime error policy
- **AND** target-discovery smoke alone MUST NOT satisfy the gate.

#### Scenario: Desktop user workflow changes
- **WHEN** a change modifies Desktop Workbench, package Webview integration, IPC, project persistence, Engine projection, or restart behavior
- **THEN** validation MUST execute a focused real Desktop AppHost functional scenario or record a blocking infrastructure condition and residual risk
- **AND** bundle asset smoke alone MUST NOT satisfy the gate.

### Requirement: Functional test evidence is path-level
Runtime functional evidence SHALL prove the canonical handler, adapter, service, or Engine path and the absence of forbidden fallback when multiple paths could produce the same visible result.

#### Scenario: New UI path replaces a legacy path
- **WHEN** a runtime UI change introduces a canonical path while a legacy path could still produce a successful screen or file
- **THEN** the functional scenario MUST record canonical path evidence and poison or assert against the legacy path
- **AND** a result-only screenshot or final file MUST NOT be accepted without path evidence.
