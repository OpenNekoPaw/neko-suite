## ADDED Requirements

### Requirement: Chat model token limit metadata
Neko Agent model configuration SHALL support explicit token-limit metadata for chat-capable models. `contextWindow` SHALL represent configured model input context capacity. `maxOutputTokens` SHALL represent the maximum provider output generation cap for the model.

#### Scenario: Chat model exposes context and output limits
- **WHEN** a configured LLM model declares `context_window = 200000` and `max_output_tokens = 64000`
- **THEN** the runtime model metadata MUST expose `contextWindow = 200000`
- **THEN** the runtime model metadata MUST expose `maxOutputTokens = 64000`
- **THEN** downstream budget resolution MUST treat them as different values

#### Scenario: Missing context window remains unknown
- **WHEN** a custom provider model omits context-window metadata
- **THEN** the model metadata MUST preserve the context window as unknown
- **THEN** Agent MUST NOT fill it from default output-token settings

#### Scenario: Missing output cap remains unknown
- **WHEN** a custom provider model omits max output-token metadata
- **THEN** the model metadata MUST preserve the output cap as unknown
- **THEN** Agent MAY use configured output defaults for the provider request but MUST NOT claim those defaults are the model hard cap

#### Scenario: Invalid token metadata is diagnosed
- **WHEN** a model declares a non-positive, non-integer, or otherwise invalid context window or max output-token value
- **THEN** Agent MUST surface a configuration diagnostic for that model
- **THEN** selected-model runtime paths MUST NOT silently replace the invalid value with a default output cap
