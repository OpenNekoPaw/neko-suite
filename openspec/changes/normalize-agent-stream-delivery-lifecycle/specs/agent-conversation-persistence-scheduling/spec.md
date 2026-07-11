## ADDED Requirements

### Requirement: Conversation persistence is serialized per storage authority
All writes that mutate the same conversation index/storage authority SHALL execute through one storage-scoped coordinator with at most one active write operation. Reusing a storage object without serialized scheduling does not satisfy this requirement.

#### Scenario: Concurrent partial updates
- **WHEN** many partial updates for one or more conversations target the same index file
- **THEN** the coordinator performs those file mutations serially and does not create an internal revision race

### Requirement: Partial conversation snapshots use latest-wins coalescing
Pending non-terminal snapshots SHALL be coalesced by conversation identity so that newer snapshots supersede older not-yet-started snapshots. Supersession MUST be observable and MUST NOT be reported as an error or as a completed durable write.

#### Scenario: Three updates during one active write
- **WHEN** snapshot A is being written and pending snapshots B then C arrive for the same conversation
- **THEN** the coordinator may omit B, writes C after A, and records B as superseded

#### Scenario: Different conversations share an index
- **WHEN** updates for different conversations arrive while one file write is active
- **THEN** the coordinator preserves each conversation's latest pending record while serializing the shared file mutation

### Requirement: Terminal snapshots are awaitable durability boundaries
A completed, cancelled-with-user-content, or explicitly saved conversation snapshot SHALL enqueue a terminal write that callers can await. Stream processing MUST NOT claim that terminal conversation persistence succeeded until the terminal write attempt and required storage flush complete.

#### Scenario: Successful stream completion
- **WHEN** an assistant turn completes normally
- **THEN** the terminal authoritative message is queued after prior partial state and the caller can await durable save completion

#### Scenario: Terminal save fails
- **WHEN** the terminal write or flush fails
- **THEN** the caller receives a typed persistence diagnostic and the UI does not silently claim the conversation was durably saved

### Requirement: Internal scheduling prevents self-generated stale revisions
Normal single-process partial streaming SHALL NOT produce `StaleJsonFileWriteError` from overlapping writes initiated by the same coordinator. Revision guards MUST remain enabled to detect real external or stale-authority conflicts.

#### Scenario: High-frequency partial persistence
- **WHEN** one turn submits partial snapshots over a long streaming response
- **THEN** no same-process overlapping write causes a stale-revision warning

#### Scenario: External writer conflict
- **WHEN** another process or window changes the guarded file after this coordinator loaded its revision
- **THEN** the write fails visibly with external-conflict context and is not converted into success by an unconditional retry

### Requirement: Flush and disposal drain required persistence work
The coordinator SHALL provide explicit `flush` and `dispose` behavior. `flush` MUST wait for the active write and all required terminal records known at the call boundary; `dispose` MUST stop accepting ordinary partial updates, preserve or attempt required terminal work, release resources, and report failures.

#### Scenario: Extension shutdown
- **WHEN** the Extension deactivates with an active write and a pending terminal snapshot
- **THEN** disposal waits for the required persistence work or returns an explicit shutdown persistence failure

#### Scenario: Partial update after disposal begins
- **WHEN** code submits another partial snapshot after disposal has started
- **THEN** the coordinator rejects it with a lifecycle diagnostic rather than silently dropping it

### Requirement: Persisted records are immutable queue inputs
A queued persistence operation SHALL capture or own an immutable authoritative record/revision. Later mutation of in-memory conversation state MUST NOT change the meaning of a write already selected by the coordinator.

#### Scenario: Conversation changes during write
- **WHEN** in-memory content advances while an earlier snapshot is being saved
- **THEN** the active write retains its selected snapshot and the newer state is represented by a distinct pending revision

### Requirement: Persistence telemetry exposes queue health without content leakage
The coordinator SHALL expose bounded counters and timings for enqueued partials, superseded partials, terminal writes, active/pending depth, write/flush latency, stale external conflicts, failures, and disposal completion. Telemetry MUST NOT include full conversation bodies by default.

#### Scenario: Queue pressure investigation
- **WHEN** a long Agent response completes
- **THEN** diagnostics can show whether partial snapshots were coalesced and whether terminal durability succeeded without logging the generated answer
