## ADDED Requirements

### Requirement: Agent composer keeps token controls explicit and combines usage display
The Agent composer and status surfaces SHALL keep input-window metadata and output-token controls as separate configuration concepts. Compact usage displays SHALL derive a single display window from input context budget plus output window. Output settings SHALL be labeled as output-generation limits.

#### Scenario: Context usage reflects combined display window
- **WHEN** the active session mode is `agent` and the selected LLM model has known budget metadata
- **THEN** the composer or status indicator MUST show current input-context usage relative to the combined input+output display window
- **THEN** it MUST NOT use Agent max output tokens as the context usage denominator
- **THEN** it MUST NOT render output window usage as a separate row in the compact usage display

#### Scenario: Output control labels generation cap
- **WHEN** the Agent composer or advanced settings expose a max token control for LLM responses
- **THEN** the control MUST be labeled as max output tokens or equivalent generation-cap language
- **THEN** it MUST NOT be labeled as the context window

#### Scenario: Unknown budget disables precise usage
- **WHEN** the selected model lacks context-window metadata
- **THEN** the context usage indicator MUST show an unknown or diagnostic state
- **THEN** the output-token control MAY remain available if an output default exists
- **THEN** the UI MUST NOT imply that the output default is the input context window
