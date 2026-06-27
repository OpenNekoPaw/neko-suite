# webview-vscode-bridge Specification

## Purpose
TBD - created by archiving change standardize-webview-vscode-bridge. Update Purpose after archive.
## Requirements
### Requirement: Canonical Webview VS Code API acquisition

The system SHALL provide one canonical Webview-side VS Code API acquisition implementation through `@neko/shared/vscode`.

#### Scenario: Webview code acquires the VS Code API

- **WHEN** production Webview code needs access to `postMessage`, `getState`, or `setState`
- **THEN** it MUST use `@neko/shared/vscode` directly or a package-local typed facade that delegates to `@neko/shared/vscode`
- **AND** it MUST NOT call `acquireVsCodeApi()` directly outside the shared bridge or an explicitly documented temporary migration shim

#### Scenario: Multiple callers request the API instance

- **WHEN** multiple modules in the same Webview request the VS Code API instance
- **THEN** the shared bridge MUST return the same cached instance after the first successful acquisition
- **AND** it MUST NOT invoke `acquireVsCodeApi()` more than once for the same Webview runtime

#### Scenario: Webview runs outside VS Code

- **WHEN** Webview code using the shared bridge runs in a non-VS Code test or development environment
- **THEN** the shared bridge MUST avoid throwing solely because the VS Code API is unavailable
- **AND** basic `postMessage` usage MUST degrade to a documented no-op or test-provided mock behavior

### Requirement: Typed package facades preserve domain ownership

The system SHALL keep domain-specific Webview message contracts in the owning package while using the shared bridge for transport.

#### Scenario: Package sends a domain message

- **WHEN** a Webview package sends a domain-specific message to its Extension Host
- **THEN** the package facade MUST validate or type the message according to that package's local protocol
- **AND** it MUST delegate transport to the shared bridge instead of owning a separate API singleton

#### Scenario: Shared bridge receives domain payloads

- **WHEN** a domain message payload is sent through the shared bridge
- **THEN** the shared bridge MUST treat the payload as transport data
- **AND** it MUST NOT import feature-package message unions, handlers, stores, React components, or Extension implementations

### Requirement: Shared bridge state helpers

The system SHALL provide shared helpers for Webview session state access through the VS Code Webview API.

#### Scenario: Webview reads session state

- **WHEN** a Webview reads recoverable UI or session state
- **THEN** it MUST use the shared bridge `getState` helper or a package facade that delegates to it
- **AND** the returned state MUST be treated as Webview session state, not durable project data

#### Scenario: Webview writes session state

- **WHEN** a Webview writes recoverable UI or session state
- **THEN** it MUST use the shared bridge `setState` helper or a package facade that delegates to it
- **AND** it MUST NOT persist project facts, runtime stream handles, blob URLs, Webview URIs, or Engine tokens as durable state through this helper

### Requirement: Request-response messaging remains shared and bounded

The system SHALL provide shared request-response helpers for Webview-to-Extension messages that need a correlated reply.

#### Scenario: Request receives successful response

- **WHEN** Webview code sends a request through the shared request-response helper
- **AND** Extension Host posts a response with the same request identifier
- **THEN** the helper MUST resolve the request with the response payload or message according to the documented shared bridge behavior

#### Scenario: Request receives error response

- **WHEN** Extension Host posts an error response with the same request identifier
- **THEN** the shared request-response helper MUST reject the pending request with an error
- **AND** it MUST clear the pending request entry

#### Scenario: Request times out or is cancelled

- **WHEN** a pending request exceeds its configured timeout or is cancelled
- **THEN** the shared bridge MUST reject or cancel that request
- **AND** it MUST clear the pending request entry without affecting unrelated domain message listeners

### Requirement: Production guardrail for bridge duplication

The system SHALL include automated guardrails that prevent new production Webview bridge duplication.

#### Scenario: Direct API acquisition is introduced

- **WHEN** a production file under `packages/*/packages/webview/src` introduces a direct `acquireVsCodeApi()` call outside an approved shared bridge or migration shim
- **THEN** the guardrail MUST fail with an actionable diagnostic naming the file
- **AND** the diagnostic MUST point developers to `@neko/shared/vscode` or the package's typed bridge facade

#### Scenario: Legacy bridge fallback is introduced

- **WHEN** a production file under `packages/*/packages/webview/src` introduces a legacy global bridge shim such as `__vscode_api__`, `__vscodeApi`, `window.vscode`, or `window.vscodeApi`
- **OR** it introduces a package-local mock `postMessage` fallback for missing VS Code Webview API access
- **THEN** the guardrail MUST fail with an actionable diagnostic naming the file
- **AND** the diagnostic MUST point developers to `@neko/shared/vscode`, shared test utilities, or the package's typed bridge facade

#### Scenario: Test code mocks acquisition

- **WHEN** Webview test setup files mock `acquireVsCodeApi()` for runtime simulation
- **THEN** the guardrail MAY allow the mock when it is scoped to test/setup files
- **AND** production code MUST still use the shared bridge path

### Requirement: Webview and Extension sandbox boundary

The system SHALL preserve the Webview sandbox boundary while standardizing bridge access.

#### Scenario: Webview needs host capability

- **WHEN** Webview UI needs workspace access, VS Code commands, resource authorization, Engine port discovery, or Extension-owned state
- **THEN** it MUST request that capability through typed `postMessage` or request-response messages
- **AND** it MUST NOT import `vscode`, Node filesystem modules, Extension implementation modules, or call VS Code APIs outside the Webview API bridge

#### Scenario: Extension handles Webview message

- **WHEN** Extension Host receives a message from a migrated Webview
- **THEN** existing domain message semantics MUST remain stable unless explicitly changed by that package's contract
- **AND** the bridge migration MUST NOT require Extension Host to know which package-local wrapper sent the message
