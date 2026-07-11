## ADDED Requirements

### Requirement: Provider chunks and semantic Agent steps are distinct
The Agent runtime SHALL classify provider transport chunks separately from semantic execution boundaries. Text, thinking, usage, and partial tool-argument chunks MUST NOT be treated as completed Agent steps merely because the provider iterator yielded them.

#### Scenario: Text-only streaming answer
- **WHEN** a provider emits thousands of text chunks before completing one assistant round
- **THEN** the runtime accumulates those chunks under one semantic round and does not create thousands of history commits or semantic step completions

#### Scenario: Tool call becomes semantically complete
- **WHEN** streamed tool arguments become a validated complete tool call
- **THEN** the runtime emits the tool-call semantic boundary exactly once before tool execution

### Requirement: Turn accumulators own in-progress source
Each active turn SHALL own isolated text and thinking accumulators keyed by explicit conversation, turn, message, and item identity. Accumulation MUST be linear in appended source length and MUST NOT construct or retain a new full transport snapshot for every provider chunk.

#### Scenario: Linear text accumulation
- **WHEN** a 5,057-character answer arrives in approximately 4,000 chunks
- **THEN** the turn accumulator produces the exact final source without cumulative-per-chunk outbound payload growth

#### Scenario: Concurrent conversations
- **WHEN** two conversations stream concurrently
- **THEN** their accumulators, revisions, cancellation state, and completion state remain isolated

### Requirement: Working memory changes only at semantic history boundaries
The Agent session SHALL project persisted events into working memory only when an event changes durable semantic history. Provider-only chunks that have not completed a history block MUST NOT repeatedly project the same history.

#### Scenario: Incomplete assistant text
- **WHEN** additional text chunks extend an assistant response but no history block has been committed
- **THEN** the session leaves working memory unchanged until the configured semantic commit boundary

#### Scenario: Completed assistant round
- **WHEN** the assistant round completes
- **THEN** the session commits the authoritative completed assistant content to working memory exactly once

### Requirement: Context compaction follows history mutations and model-call boundaries
Automatic context-compaction checks SHALL run only when working memory has materially changed or immediately before a model request that requires a current budget decision. A text/thinking provider chunk with unchanged history MUST NOT trigger token estimation or compaction.

#### Scenario: Thousands of display chunks
- **WHEN** one assistant round streams thousands of display-only chunks
- **THEN** context-compaction check count remains bounded by semantic history/model-call boundaries rather than provider chunk count

#### Scenario: Tool results extend history
- **WHEN** completed tool results are committed before the next model request
- **THEN** the runtime performs a current compaction decision using the updated history before invoking the model again

### Requirement: Turn completion and cancellation are explicit lifecycle boundaries
A turn SHALL have explicit active, completing, completed, cancelling, cancelled, and disposed lifecycle behavior. Completion MUST flush required ordered output before reporting completion; cancellation and disposal MUST stop new delivery, release timers/subscriptions, and make late events fail visibly.

#### Scenario: Normal completion
- **WHEN** the provider reports completion
- **THEN** pending text/thinking updates are flushed, final authoritative content is committed, and the turn transitions to completed once

#### Scenario: Late chunk after disposal
- **WHEN** a provider or background callback emits an event after the turn channel is disposed
- **THEN** the runtime emits a typed lifecycle diagnostic and does not mutate another turn or silently ignore the contract violation

### Requirement: Stream-path telemetry distinguishes source and downstream work
The Agent runtime SHALL record bounded per-turn counters for provider chunks, semantic boundaries, history commits, compaction checks, accumulated source length, emitted transport operations, completion, cancellation, and lifecycle diagnostics. Telemetry MUST NOT log full private response bodies by default.

#### Scenario: Performance regression diagnosis
- **WHEN** a turn completes
- **THEN** diagnostics can compare provider chunk count with semantic step, compaction, and delivery counts without reading response content
