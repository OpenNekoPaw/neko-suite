## ADDED Requirements

### Requirement: Shared Webview i18n bootstrap

The system SHALL provide a shared Webview i18n bootstrap helper that creates a per-Webview i18n service, detects the Webview locale, registers locale bundles, and exposes stable translation adapters without requiring each package to repeat the same setup.

#### Scenario: Webview package initializes translations

- **WHEN** a Webview package provides supported locale bundle maps to the shared i18n bootstrap helper
- **THEN** the helper MUST create an isolated i18n service for that Webview
- **AND** it MUST register all provided bundles under the package namespace or configured namespaces
- **AND** it MUST expose translation and locale update helpers suitable for existing package entry points

#### Scenario: Locale changes from Extension Host

- **WHEN** a migrated Webview receives a locale-change message from its Extension Host
- **THEN** it MUST update the shared-created i18n service through the shared adapter
- **AND** existing package `t(...)` behavior MUST continue to resolve the same keys and fallback to key names when missing

### Requirement: Shared Webview logger and production console guardrail

The system SHALL standardize Webview logger setup on shared logger registry/factory APIs and prevent production Webview code from using direct `console.*` logging as formal diagnostics.

#### Scenario: Webview package creates a logger

- **WHEN** a Webview package needs root or child loggers
- **THEN** it MUST use the shared logger registry/factory pattern or a package-local facade that delegates to it
- **AND** tests MUST be able to replace or inspect the root logger without editing component code

#### Scenario: Production console usage is introduced

- **WHEN** production Webview source introduces direct `console.log`, `console.error`, `console.warn`, `console.info`, or `console.debug`
- **THEN** the quality guardrail MUST fail with an actionable diagnostic naming the file
- **AND** the diagnostic MUST point developers to the package logger facade or shared logger registry

### Requirement: Shared Webview ErrorBoundary behavior

The system SHALL provide a shared React ErrorBoundary primitive or factory for Webviews that captures render errors, logs them through the shared logger contract, and supports accessible recovery UI.

#### Scenario: Webview component throws during render

- **WHEN** a child component under the shared ErrorBoundary throws during render or lifecycle
- **THEN** the ErrorBoundary MUST log the error and component stack through an injected or package-provided logger
- **AND** it MUST render a fallback state with package-configurable title/body/actions
- **AND** it MUST NOT call `console.error` directly in production Webview code

#### Scenario: Package needs custom fallback presentation

- **WHEN** a Webview package needs package-specific fallback copy or styling
- **THEN** it MUST provide those differences through props, slots, or a thin package-local wrapper
- **AND** the catch/log/reset behavior MUST remain owned by the shared ErrorBoundary primitive

### Requirement: Shared Engine media stream lifecycle

The system SHALL provide reusable Engine media stream lifecycle helpers that centralize H264/audio stream client and frame scheduler creation, reconnect handling, error callbacks, and disposal ordering for Webview media players.

#### Scenario: Webview starts a synchronized A/V stream

- **WHEN** a Webview starts playback from an authorized Engine video and optional audio stream descriptor
- **THEN** it MUST be able to create the H264 client, optional AudioStreamClient, and FrameScheduler through the shared lifecycle helper
- **AND** the helper MUST expose status, frame, audio, error, reconnect, and disposal hooks without importing feature Webview components

#### Scenario: Stream is replaced or component unmounts

- **WHEN** the stream descriptor changes or the owning component unmounts
- **THEN** the shared lifecycle helper MUST dispose scheduler, video client, audio client, and pending reconnect timers in a deterministic order
- **AND** it MUST avoid leaking WebSocket, WebCodecs, Web Audio, animation frame, or timer resources

#### Scenario: Domain-specific playback policy differs

- **WHEN** a package has domain-specific rendering, volume, fallback, or timeline policy
- **THEN** that policy MUST remain in the owning package
- **AND** it MUST integrate with the shared lifecycle helper through callbacks or adapters instead of copying client lifecycle code

### Requirement: Canonical generic media time formatting

The system SHALL use canonical generic media time formatting helpers from `@neko/neko-client` for ordinary media player labels and keep domain-specific time formats local only when their semantics differ.

#### Scenario: Generic media player displays time

- **WHEN** a Webview displays ordinary media elapsed time or duration in `M:SS`, `H:MM:SS`, or precise media time format
- **THEN** it MUST use `@neko/neko-client` time formatting helpers or a package facade that delegates to them
- **AND** it MUST NOT define a new local generic formatter with equivalent semantics

#### Scenario: Domain-specific time format is required

- **WHEN** a Webview displays subtitle timecode, musical bar/beat, export ETA prose, chat relative time, task duration, or localized duration copy
- **THEN** it MAY keep a domain-specific formatter in the owning package
- **AND** that formatter MUST be named or documented to reflect its domain semantics rather than masquerading as the generic media formatter

### Requirement: Shared Webview keyboard and focus primitives

The system SHALL use `@neko/ui/keyboard` as the canonical Webview keyboard/focus primitive surface.

#### Scenario: Webview reports keyboard focus

- **WHEN** a Webview root reports keyboard focus or editable-target state to its Extension Host
- **THEN** it MUST use `@neko/ui/keyboard` reporting helpers or a package-local wrapper that delegates to them
- **AND** it MUST preserve existing `webviewKeyboardFocus`, `webviewKeyboardEditable`, and `keyboardFocus` message semantics

#### Scenario: Webview checks editable targets

- **WHEN** Webview keyboard handling needs to ignore input, textarea, select, contenteditable, role textbox, or Neko text-input scoped targets
- **THEN** it MUST use `isEditableTarget` or `hasEditableActiveElement` from `@neko/ui/keyboard`
- **AND** it MUST NOT keep a package-local copy of editable-target detection unless a documented domain-specific extension is required

### Requirement: Foundation duplication guardrails

The system SHALL include automated checks or focused tests that make reintroducing duplicate Webview foundations visible during validation.

#### Scenario: Duplicate foundation pattern is reintroduced

- **WHEN** production Webview source reintroduces a blocked duplicate foundation pattern covered by this change
- **THEN** the guardrail MUST fail with an actionable diagnostic naming the file and replacement shared API
- **AND** approved exceptions MUST document owner, reason, replacement path, validation command, and removal condition

#### Scenario: Shared foundation behavior is migrated package by package

- **WHEN** a package is migrated to a shared foundation helper
- **THEN** focused package tests or TypeScript checks MUST prove existing user-visible behavior and message contracts still work
- **AND** validation MUST prove obsolete package-local duplicate helpers are removed or retained only as documented thin facades
