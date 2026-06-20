## ADDED Requirements

### Requirement: Unified composer mode configuration
The Agent composer SHALL present a single mode/configuration control model where the left control selects the active creative mode and the right side renders independent dropdown chips for each configurable value of that active mode.

#### Scenario: Agent mode configuration chips are visible
- **WHEN** the active session mode is `agent`
- **THEN** the composer shows `Agent` as the selected mode
- **AND** the configuration area separates model configuration from Agent behavior parameters
- **AND** the primary LLM model, available image/video/audio generation model slots, reasoning preset, verbosity preset, and creativity preset are independently configurable dropdowns

#### Scenario: Media mode configuration chips are visible
- **WHEN** the active session mode is `image`, `video`, or `audio`
- **THEN** the composer shows the selected media mode
- **AND** the configuration area shows the selected media model and relevant generation parameters as independent dropdowns

#### Scenario: Switching modes updates active configuration
- **WHEN** the user changes the active composer mode
- **THEN** the configuration chips reflect the newly selected mode without showing stale controls from the previous mode

#### Scenario: Execution mode stays with runtime controls
- **WHEN** the active session mode is `agent`
- **THEN** the execution approval mode remains in the bottom runtime toolbar near send/tool controls
- **AND** it is not grouped with model configuration or Agent behavior parameter chips

### Requirement: Agent LLM presets
The Agent composer SHALL expose creator-facing Agent LLM presets for reasoning depth, output verbosity, and creativity instead of requiring users to edit provider-specific raw parameters for common behavior changes.

#### Scenario: Presets are included in Agent send intent
- **WHEN** the user sends an Agent message with selected Agent LLM presets
- **THEN** the Webview-to-Extension message includes the normalized Agent LLM preset values for that Agent turn

#### Scenario: Presets map only to supported provider parameters
- **WHEN** a selected model does not support a preset's provider-level parameter
- **THEN** the unsupported parameter is not sent to the provider and the UI either hides the control or presents a diagnostic before send

### Requirement: Agent model slots
The Agent configuration contract SHALL define model slots for `primary`, `fast`, `deep`, `summarizer`, and `vision` so future Agent orchestration can address purpose-specific LLM selections without changing the composer contract.

#### Scenario: Primary slot drives normal Agent turns
- **WHEN** the user sends a normal Agent message
- **THEN** the runtime uses the selected `primary` model slot or the configured default LLM model for the Agent turn

#### Scenario: Unsupported slot use is diagnosed
- **WHEN** a payload references a model slot that the current runtime path does not support
- **THEN** the Extension returns or logs a fail-visible diagnostic instead of silently ignoring the slot

#### Scenario: Unknown slot is rejected
- **WHEN** the Webview sends an Agent model slot outside the supported slot list
- **THEN** the Extension rejects the message payload as invalid

### Requirement: Capability-aware LLM controls
The system SHALL derive Agent LLM control availability from model/provider capabilities and SHALL validate capabilities at the Extension boundary before provider calls are made.

#### Scenario: Reasoning controls require reasoning capability
- **WHEN** the selected model does not declare support for reasoning effort or thinking budget
- **THEN** reasoning controls are hidden or disabled and send payloads containing unsupported reasoning values are rejected or diagnosed

#### Scenario: Verbosity controls require verbosity capability
- **WHEN** the selected model does not declare support for output verbosity parameters
- **THEN** verbosity controls are hidden or disabled and unsupported verbosity payload values are rejected or diagnosed

#### Scenario: Custom providers default to conservative controls
- **WHEN** a custom provider model has no explicit capability metadata for advanced LLM parameters
- **THEN** the composer exposes only conservative common controls and does not assume reasoning, verbosity, fast tier, or provider-specific thinking support

### Requirement: Provider parameter mapping
The Platform adapter layer SHALL map normalized Agent LLM presets and advanced parameters to provider-specific request options, and SHALL reject unsupported provider parameter combinations visibly.

#### Scenario: OpenAI-compatible reasoning mapping
- **WHEN** an OpenAI Responses-compatible model supports reasoning effort
- **THEN** the normalized Agent reasoning preset maps to a supported `reasoning.effort` value for the provider request

#### Scenario: Anthropic-compatible thinking mapping
- **WHEN** an Anthropic-compatible model supports thinking controls
- **THEN** the normalized Agent reasoning preset maps to the supported Anthropic thinking parameter shape without violating provider restrictions

#### Scenario: Unsupported sampling combination is blocked
- **WHEN** a provider/model forbids a requested sampling or thinking parameter combination
- **THEN** Platform returns a fail-visible diagnostic before or at provider dispatch instead of silently dropping the invalid parameter

### Requirement: Mode-specific command affordances
The composer SHALL keep command affordances appropriate to the active mode while preserving shared references and attachments.

#### Scenario: Direct media generation hides command menus
- **WHEN** the active session mode is `image`, `video`, or `audio`
- **THEN** `/` and `$` command affordances are hidden and keyboard input does not open slash or skill command menus

#### Scenario: Roleplay hides command menus
- **WHEN** the active conversation kind is character roleplay or embody-character
- **THEN** `/` and `$` command affordances are hidden and keyboard input does not open slash or skill command menus

#### Scenario: References remain available
- **WHEN** the active mode supports references and the user types `@`
- **THEN** the composer preserves the existing mention/reference behavior for files, entities, context chips, or media references that are valid for the current conversation

### Requirement: Session-scoped composer configuration
The system SHALL keep composer mode configuration session-scoped for the MVP unless the user explicitly updates durable Agent configuration.

#### Scenario: Composer changes do not rewrite config automatically
- **WHEN** the user changes Agent presets or model slots in the composer
- **THEN** the current session uses the new values without implicitly rewriting user TOML or global settings

#### Scenario: Defaults initialize composer state
- **WHEN** a new Agent conversation is opened
- **THEN** the composer initializes from the current config snapshot defaults for LLM and media model selections
