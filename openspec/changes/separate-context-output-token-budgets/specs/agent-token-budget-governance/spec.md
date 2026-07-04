## ADDED Requirements

### Requirement: Agent resolves token budgets from independent input and output windows
Neko Agent SHALL resolve a per-turn token budget before invoking a chat provider. The budget SHALL distinguish the selected model's configured input context window, the effective input budget, the requested output cap, the effective output cap, reasoning reserve tokens, and safety margin tokens.

#### Scenario: Effective input budget uses the configured input window
- **WHEN** a selected model has `contextWindow = 128000`, `maxOutputTokens = 32000`, and the turn requests `maxOutputTokens = 8192`
- **THEN** Agent MUST resolve `effectiveMaxOutputTokens = 8192`
- **THEN** Agent MUST compute `effectiveInputBudget` from `contextWindow - safetyMarginTokens`
- **THEN** Agent MUST NOT subtract the output cap or reasoning reserve from the input context window
- **THEN** Agent MUST NOT use the output cap as the context-window denominator

#### Scenario: Model output cap limits requested output
- **WHEN** a selected model declares `maxOutputTokens = 128000` and a turn requests `maxOutputTokens = 256000`
- **THEN** Agent MUST return a fail-visible diagnostic or clamp to the known model cap before provider dispatch
- **THEN** Agent MUST NOT send `256000` as a provider output-token parameter

#### Scenario: Impossible input budget blocks dispatch
- **WHEN** the selected model input context window is smaller than or equal to the safety margin
- **THEN** Agent MUST fail visibly before provider dispatch
- **THEN** the diagnostic MUST name the selected model and the conflicting budget components

### Requirement: Provider requests receive output-token caps only
Neko Agent SHALL send provider `max_tokens`, `maxOutputTokens`, `num_predict`, or equivalent wire fields only as output generation limits. Provider adapters SHALL NOT interpret those fields as input context-window limits.

#### Scenario: OpenAI-compatible request uses resolved output cap
- **WHEN** Agent dispatches an OpenAI-compatible chat request after resolving `effectiveMaxOutputTokens = 8192`
- **THEN** the provider request MUST send `max_tokens` or `maxOutputTokens` with value `8192`
- **THEN** the provider request MUST NOT send the selected model's `contextWindow` as the output cap

#### Scenario: Adapter does not compute context budget
- **WHEN** a provider adapter receives normalized chat options
- **THEN** the adapter MUST map only the already-resolved output cap to provider wire fields
- **THEN** the adapter MUST NOT recompute input budget from Webview settings or TOML scalar defaults

### Requirement: Context compaction manages input history only
Neko Agent compact operations SHALL reduce model input context by summarizing, trimming, or compressing conversation history, tool results, and other request-input material. Compact operations SHALL NOT mutate future output-token limits.

#### Scenario: Manual compact preserves output cap
- **WHEN** the user invokes `/compact` or the Webview `compressContext` action
- **THEN** Agent MUST compact conversation input history according to the compressor strategy
- **THEN** the selected turn's output cap and model output cap MUST remain unchanged

#### Scenario: Auto-compact threshold derives from input budget
- **WHEN** Agent estimates current input context tokens near the effective input budget
- **THEN** Agent MUST compare the estimate against an auto-compact threshold derived from the effective input budget or a smaller explicit auto-compact setting
- **THEN** Agent MUST NOT use the default output cap as the auto-compact context threshold

#### Scenario: Tool outputs are compressed as input context
- **WHEN** compact processes tool result messages
- **THEN** Agent MAY preserve essential fields such as status, summary, error, and result
- **THEN** Agent MAY discard or truncate verbose fields such as raw data, debug traces, stack traces, or equivalent bulky input-only content

### Requirement: Token usage display combines input and output windows
Neko Agent SHALL expose enough token-budget state for Webview and CLI surfaces to display current input-context usage against a combined input+output display window while keeping output-token limits available for provider validation and output controls.

#### Scenario: Context indicator uses combined display window
- **WHEN** Webview renders the Agent context usage indicator for a selected model with known token-budget metadata
- **THEN** the indicator MUST compare estimated current input tokens against `effectiveInputBudget + displayOutputWindow`
- **THEN** `displayOutputWindow` SHOULD prefer known model max output tokens and MAY fall back to the resolved output cap when model output metadata is unknown
- **THEN** it MUST NOT compare input tokens against the default output cap

#### Scenario: Compact usage does not show output separately
- **WHEN** Webview or CLI shows compact token usage
- **THEN** it MUST NOT render a separate output-token usage row
- **THEN** output-token settings and advanced controls MUST still label the generation cap as output tokens or max output tokens

#### Scenario: Unknown context window is diagnostic
- **WHEN** the selected model has no known context window
- **THEN** Webview and CLI MUST show an unknown or diagnostic context-budget state
- **THEN** they MUST NOT substitute the output cap as a fake context-window denominator
