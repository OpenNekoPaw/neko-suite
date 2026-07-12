## ADDED Requirements

### Requirement: Conversation runtime owns the authoritative turn projection
Ordered assistant text, thinking, tool, Task, SubAgent, media, error, and completion state SHALL be accumulated into a versioned authoritative turn projection owned by the conversation runtime. Webview foreground state, React commits, and Markdown components MUST NOT be projection authorities.

#### Scenario: Provider emits many chunks
- **WHEN** a provider emits thousands of text or thinking chunks for one turn
- **THEN** the conversation projection MUST accumulate the exact ordered source
- **AND** transport MAY coalesce adjacent appends without constructing or sending a full snapshot for every provider chunk

### Requirement: Render attachments start with snapshot acknowledgement
Each Tab render runtime SHALL attach using an identity containing endpoint epoch, attachment ID, Tab ID, and conversation ID. The Extension MUST send one authoritative snapshot through that attachment's serialized queue and MUST NOT send live patches until the Tab runtime acknowledges that snapshot and version.

#### Scenario: New background Tab attaches
- **WHEN** a background Tab opens for a running conversation
- **THEN** it MUST receive and acknowledge its own authoritative snapshot before live patches begin
- **AND** foreground visibility MUST NOT be required for attachment or delivery

#### Scenario: Patch arrives before snapshot ACK
- **WHEN** a patch is produced while an attachment is awaiting snapshot acknowledgement
- **THEN** the patch MUST remain queued or be coalesced behind the snapshot
- **AND** it MUST NOT be posted ahead of the acknowledged snapshot

### Requirement: Snapshot and patches share one serialized attachment queue
Snapshot selection, posting, acknowledgement transition, patch selection, and detach SHALL be ordered through one attachment-owned lifecycle. A separate recovery post path MUST NOT race with live delivery.

#### Scenario: Projection changes during snapshot delivery
- **WHEN** the conversation projection advances while snapshot version V is awaiting acknowledgement
- **THEN** the attachment MUST preserve or coalesce the changes as patches based on V
- **AND** those patches MUST be delivered only after the acknowledgement of V

### Requirement: Visibility does not control attachment lifecycle
Tab activation or hiding SHALL NOT attach, detach, flush, discard, reset, or change the sequence authority of a render attachment. Attachments end only through explicit Tab close/disposal, endpoint replacement, conversation disposal, or typed fatal protocol failure.

#### Scenario: Rapid Tab switching
- **WHEN** the user switches A to B to A while both conversations stream
- **THEN** neither attachment sequence nor projection version may reset
- **AND** no foreground-only flush or background discard may occur

### Requirement: Endpoint replacement creates new attachments
When the Webview endpoint epoch changes, all attachments from the old epoch MUST become invalid. Each retained Tab runtime MUST perform a new attach and receive an authoritative snapshot; old frames or acknowledgements MUST fail identity validation.

#### Scenario: Webview reload
- **WHEN** the Webview reloads while a turn is active
- **THEN** old attachment frames and persisted delivery revisions MUST NOT be replayed into the new endpoint
- **AND** the new Tab runtime MUST attach from an authoritative conversation snapshot

### Requirement: Endpoint discovery verifies the Webview protocol version
The Webview and Extension SHALL exchange an explicit Agent Webview protocol version during endpoint discovery. A missing or mismatched version MUST fail with a typed protocol-mismatch diagnostic and MUST NOT expose the endpoint or start attachments.

#### Scenario: Extension Host restarts while an older Webview bundle remains mounted
- **WHEN** the retained Webview sends endpoint discovery without the current protocol version
- **THEN** the Extension MUST reject discovery with a `webview-protocol-mismatch` diagnostic containing the expected and received versions
- **AND** it MUST NOT report the request as a generic global error or attach any Tab runtime

### Requirement: Established live gaps fail visibly instead of entering fallback recovery
After an attachment becomes live, frame sequence gaps, patch base-version mismatches, and identity mismatches SHALL close or suspend that attachment with a typed protocol diagnostic. The canonical path MUST NOT repeatedly request snapshots to make an internally generated gap appear successful.

#### Scenario: Live frame sequence gap
- **WHEN** a live attachment applies frame sequence 4 and next receives sequence 6
- **THEN** it MUST reject sequence 6 and expose a protocol-gap diagnostic
- **AND** it MUST NOT mutate render state or automatically continue through the same attachment

#### Scenario: Explicit reattach after fatal gap
- **WHEN** the host chooses to recover from a fatal attachment diagnostic
- **THEN** it MUST create a new attachment identity and start with an authoritative snapshot
- **AND** the old attachment MUST never resume or accept later frames
