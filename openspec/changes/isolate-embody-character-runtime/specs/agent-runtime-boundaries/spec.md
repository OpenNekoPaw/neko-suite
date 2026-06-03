## ADDED Requirements

### Requirement: Character role modes enforce capability policy below Webview
The Agent system SHALL enforce Character Dialogue and Embody Character capability policies in Extension/runtime/controller layers rather than relying on Webview presentation or prompt text alone.

#### Scenario: Webview cannot grant creative tools
- **WHEN** Webview sends a message from an `embody-character` tab
- **THEN** Extension/runtime routing determines the isolated feedback session and blocked capabilities regardless of client-side UI state

#### Scenario: Prompt-only restrictions are insufficient
- **WHEN** a role mode forbids creative authoring or skill activation
- **THEN** the forbidden tools and skills are removed from the responder capability surface before LLM execution rather than only described as prompt instructions

### Requirement: Embody Character owns a runtime counterpart
The Agent Extension SHALL NOT own Embody Character strategy as an ad hoc ordinary chat prompt. A host-agnostic runtime session or equivalent domain primitive SHALL define Embody Character turn semantics, transcript behavior, and capability policy.

#### Scenario: Extension delegates turn semantics
- **WHEN** Extension routes an Embody Character user message
- **THEN** it delegates the turn to an Embody Character runtime/session primitive with injected host adapters instead of composing feedback behavior inside Webview or command glue

#### Scenario: Runtime compiles without Webview
- **WHEN** Embody Character runtime tests run in `@neko/agent`
- **THEN** they can exercise turn behavior and capability policy without importing React, VSCode Webview code, or Dashboard implementation modules
