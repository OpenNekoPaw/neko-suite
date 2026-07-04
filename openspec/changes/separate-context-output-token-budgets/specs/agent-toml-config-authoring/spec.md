## ADDED Requirements

### Requirement: TOML token fields have distinct semantics
Neko Agent TOML configuration SHALL distinguish output-token defaults from model input context-window metadata. `[defaults].max_tokens` SHALL define the default output generation cap. `models[].context_window` SHALL define the model input context window. `models[].max_output_tokens` SHALL define the model's maximum output generation cap.

#### Scenario: Default max tokens maps to output cap
- **WHEN** `config.toml` contains `[defaults] max_tokens = 8192`
- **THEN** the TOML adapter MUST convert it to a default output-token cap for provider generation
- **THEN** it MUST NOT use `8192` as the selected model context window

#### Scenario: Model context window maps to input window metadata
- **WHEN** `config.toml` contains `context_window = 256000` on a model entry
- **THEN** the TOML adapter MUST convert it to model input context-window metadata
- **THEN** provider request builders MUST NOT send `256000` as a provider output-token cap unless it is also the resolved output cap and is valid for the model

#### Scenario: Model output cap maps to output metadata
- **WHEN** `config.toml` contains `max_output_tokens = 128000` on a model entry
- **THEN** the TOML adapter MUST convert it to model maximum output-token metadata
- **THEN** Agent runtime MUST use it to validate or clamp requested output caps for that model

#### Scenario: Oversized default output cap is diagnosed
- **WHEN** `[defaults].max_tokens` is larger than the selected model's known `max_output_tokens`
- **THEN** Agent MUST return a visible configuration or preflight diagnostic before provider dispatch
- **THEN** Agent MUST NOT reinterpret the default as a context window

## MODIFIED Requirements

### Requirement: Programmatic config writes target TOML
Neko-managed commands that create or update Agent configuration SHALL write TOML after this migration. Programmatic writes MUST keep the generated TOML parseable and convertible to `UnifiedConfig`. Programmatic writes that update token settings MUST preserve the distinct meanings of output-token defaults, model context windows, and model output caps.

#### Scenario: Provider settings update writes TOML
- **WHEN** Agent updates a user-owned provider endpoint, credential reference, enabled state, or model setting through a Neko-managed command
- **THEN** the resulting persisted user config MUST be `config.toml`
- **THEN** the updated file MUST parse through the canonical TOML reader

#### Scenario: Scalar settings update writes TOML
- **WHEN** Agent updates scalar settings such as max output tokens, temperature, streaming, or execution mode through a Neko-managed command
- **THEN** the resulting persisted user config MUST be `config.toml`
- **THEN** unrelated provider and model entries MUST remain represented in the converted runtime config
- **THEN** the write MUST NOT store a model context-window value in `[defaults].max_tokens`
