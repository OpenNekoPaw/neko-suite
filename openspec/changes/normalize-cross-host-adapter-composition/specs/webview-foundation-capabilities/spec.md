## ADDED Requirements

### Requirement: Host-provided Webview foundation context

Shared Webview foundations SHALL accept host-provided context for theme, locale, logger, diagnostics, keyboard/focus reporting, and resource projection so VSCode and Desktop can render package-owned UI consistently.

#### Scenario: Package Webview initializes in a graphical host

- **WHEN** a package-owned Webview root initializes inside VSCode or Electron
- **THEN** the host MUST provide the foundation context required by that package root
- **AND** package components MUST use shared foundation providers or thin package wrappers instead of duplicating host-specific theme, i18n, logger, error, or keyboard setup

#### Scenario: Host foundation context is missing

- **WHEN** a package Webview requires a foundation context that the host did not provide
- **THEN** initialization MUST fail visibly with a missing-foundation diagnostic
- **AND** the package MUST NOT silently construct a second local design system or logger runtime as a fallback

### Requirement: Shell styling differs only at shell boundaries

VSCode and Desktop MAY provide different shell chrome, window controls, and workbench framing, but package-owned components SHALL receive the same shared foundation semantics.

#### Scenario: Desktop applies native shell chrome

- **WHEN** Desktop renders a package-owned feature surface inside its macOS/Linux/Windows shell
- **THEN** Desktop MAY style the outer shell and layout frame for native integration
- **AND** it MUST NOT fork the package component internals solely to match Desktop shell styling
