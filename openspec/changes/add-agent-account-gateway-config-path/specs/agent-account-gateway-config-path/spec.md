## ADDED Requirements

### Requirement: AI provider sources are resolved by explicit priority

Neko Agent SHALL resolve AI provider/model configuration from explicit user configuration before using the OAuth-backed Neko account gateway. A user configuration SHALL count as explicit AI configuration only when it declares an AI provider/model selection, AI provider entries, AI model entries, or an explicit chat model request. Non-AI settings such as MCP servers, auth settings, UI scalars, or workspace-only tool settings SHALL NOT disable the account gateway path.

#### Scenario: Explicit local AI selection wins

- **WHEN** `~/.neko/config.json` contains an explicit enabled AI provider, chat model, `defaultProvider`, and `defaultModel`
- **THEN** Agent provider resolution MUST use the explicit config source
- **THEN** it MUST NOT replace the selected provider/model with the Neko account gateway even if an OAuth session exists

#### Scenario: Non-AI config does not block account gateway

- **WHEN** the user config file exists but contains only MCP, auth, UI, or other non-AI settings
- **THEN** Agent provider resolution MUST treat explicit AI config as absent
- **THEN** it MAY use the OAuth-backed Neko account gateway when an entitled account catalog is available

#### Scenario: Invalid explicit AI config blocks fallback

- **WHEN** user config explicitly selects an AI provider or model that is missing, disabled, unconfigured, or mismatched
- **THEN** Agent provider resolution MUST return a visible diagnostic for the explicit config source
- **THEN** it MUST NOT silently fall back to the Neko account gateway or another configured provider

### Requirement: OAuth account gateway provides a runtime-only provider snapshot

Neko Agent SHALL represent OAuth-derived Neko official AI access as a runtime-only account gateway provider/model snapshot. The snapshot SHALL be available for provider/model selection only when an active OAuth session and entitled account catalog are available. OAuth-derived gateway credentials, internal routing secrets, and access/refresh tokens MUST NOT be persisted into user config files, workspace files, Webview state, prompts, tool payloads, or logs.

#### Scenario: Account catalog creates provider snapshot

- **WHEN** a valid OAuth session exists and the Neko official AI catalog returns entitled chat models
- **THEN** Agent provider resolution MUST expose a runtime account gateway provider with gateway connection metadata
- **THEN** the provider's models MUST be derived from the account catalog
- **THEN** the provider MUST be treated as configured without requiring the user to enter an API key

#### Scenario: OAuth secrets are not projected

- **WHEN** the account gateway snapshot is sent to Webview settings, header, onboarding, or config state messages
- **THEN** the message MUST include only secret-free provider, model, entitlement, usage, availability, and diagnostic fields
- **THEN** it MUST NOT include OAuth tokens, refresh tokens, gateway API keys, internal routing credentials, or authorization headers

#### Scenario: Account logout clears runtime gateway

- **WHEN** the user logs out or the auth service reports a definitively invalid session
- **THEN** Agent MUST invalidate the cached account gateway snapshot
- **THEN** new provider resolution MUST no longer treat account gateway models as configured until a new valid session and catalog are available

### Requirement: Account catalog refresh is cached and event-driven

Neko Agent SHALL reuse a current account AI catalog snapshot for new Agent sessions instead of synchronously fetching the catalog for every conversation. It MUST refresh or invalidate the snapshot on explicit refresh triggers including OAuth session changes, TTL expiry, manual refresh, catalog version mismatch, entitlement mismatch, and authorization failures from Neko official APIs or account gateway calls.

#### Scenario: New Agent tab reuses fresh catalog

- **WHEN** a new Agent tab opens and a non-expired account catalog snapshot is available
- **THEN** Agent MUST use that snapshot to project account gateway providers and models
- **THEN** it MUST NOT block the tab startup on a mandatory catalog fetch solely because the tab is new

#### Scenario: Session change refreshes catalog

- **WHEN** OAuth login, logout, or silent token refresh changes the account session
- **THEN** Agent MUST refresh or clear the account catalog snapshot according to the new session state
- **THEN** Agent MUST broadcast updated secret-free provider/model state to registered Webviews

#### Scenario: Authorization failure invalidates catalog

- **WHEN** a Neko official API or account gateway request returns an authorization or entitlement failure for the current account snapshot
- **THEN** Agent MUST invalidate or refresh the snapshot before subsequent provider resolution
- **THEN** unresolved authorization failure MUST be surfaced as a visible diagnostic

### Requirement: Conversation runtime fails visibly for unavailable account source

Agent conversation runtime SHALL reject missing, unavailable, unauthorized, disabled, or provider/model-mismatched account gateway selections before configuring the LLM runner. It SHALL NOT use a hard-coded default provider/model, the first configured provider/model, or another provider source when the selected account gateway model is unavailable.

#### Scenario: No provider source blocks conversation

- **WHEN** there is no explicit AI config and no valid entitled account gateway snapshot
- **THEN** sending a chat message MUST produce a visible precondition error
- **THEN** no LLM runner or provider fallback path MUST be invoked

#### Scenario: Selected account model is not entitled

- **WHEN** the selected account gateway model is absent from the account catalog or not allowed by entitlement
- **THEN** conversation runtime MUST return a visible precondition error
- **THEN** it MUST NOT select another account model or another provider source automatically

#### Scenario: Explicit request source is preserved

- **WHEN** a chat message includes an explicit provider/model request
- **THEN** runtime validation MUST evaluate that requested provider/model against its owning source
- **THEN** success MUST require that the selected source, provider, model, and entitlement are all valid

### Requirement: Model capabilities determine workflow eligibility

Neko Agent SHALL treat vision and generation support as model capabilities supplied by explicit config or account catalog. Text chat workflows MUST NOT require vision capability. Workflows that require image understanding or generation MUST validate required capabilities on the selected model before execution.

#### Scenario: Text-only account or local LLM remains selectable

- **WHEN** a model supports `chat` but does not declare `vision`
- **THEN** Agent MUST allow that model for text chat workflows
- **THEN** it MUST NOT reject the model solely because it lacks visual understanding

#### Scenario: Vision workflow requires vision capability

- **WHEN** a workflow requires image understanding
- **THEN** Agent MUST validate that the selected model declares `vision`
- **THEN** it MUST return a visible capability diagnostic when the selected model is text-only

#### Scenario: Generation workflow requires generation capability

- **WHEN** a workflow requires image, video, audio, or music generation
- **THEN** Agent MUST validate the corresponding generation capability on the selected model
- **THEN** it MUST return a visible capability diagnostic instead of falling back to another generation model

### Requirement: Webview model lists are source-grouped and capability-scoped

Agent Webview model projections SHALL keep provider source and model purpose as separate axes. Model lists SHALL group selectable models by source/provider first, with OAuth-backed Neko official account gateway models ordered before user-configured providers when an entitled account catalog is available. Within each source/provider group, models SHALL remain separated by model type or capability such as LLM, image, video, audio, and music. Future domain model types SHALL be introduced through model type/capability metadata rather than hard-coded provider names.

#### Scenario: OAuth catalog shows official group first

- **WHEN** OAuth is active and the Neko official account catalog returns entitled LLM and domain models
- **THEN** the Webview model projection MUST include a Neko official source group before user-configured provider groups
- **THEN** the Neko official source group MUST separate LLM models from image, video, audio, music, or other domain model categories

#### Scenario: Config providers follow official group

- **WHEN** both account gateway models and user-configured provider models are available
- **THEN** user-configured provider groups MUST appear after the Neko official source group
- **THEN** each user-configured provider group MUST preserve provider identity and connection metadata such as gateway, custom gateway, local, or direct when available

#### Scenario: No OAuth shows only configured provider groups

- **WHEN** no valid OAuth account catalog is available
- **THEN** the Webview model projection MUST include only selectable models from explicit user configuration
- **THEN** it MUST NOT show an empty Neko official source group

#### Scenario: Conversation selector hides empty groups

- **WHEN** a source/provider group or model type has no selectable models
- **THEN** the conversation model selector MUST hide that empty group or category
- **THEN** it MUST show a setup or diagnostic state only when no source has any selectable models

#### Scenario: Settings may show configured empty groups with diagnostics

- **WHEN** a provider is configured or discovered but has no selectable models because credentials, entitlement, enabled models, or capability support are missing
- **THEN** settings or configuration views MAY show that provider group
- **THEN** they MUST include a visible diagnostic explaining why no models are selectable
