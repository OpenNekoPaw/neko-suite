## ADDED Requirements

### Requirement: Native media is scoped to its originating Agent turn

Agent provider projection SHALL expand a serialized multimodal context packet or tool-produced provider-loadable perception reference only while executing the turn that introduced that input.

#### Scenario: Current turn native attachment is projected

- **WHEN** the current Agent turn contains a multimodal context packet after its user input
- **AND** the selected chat model supports the packet modality
- **THEN** provider projection SHALL include the packet media in that turn

#### Scenario: Current turn tool media is projected

- **WHEN** a media-reading tool produces a provider-loadable perception card after the current turn user input
- **AND** the selected chat model supports the card modality
- **THEN** provider projection SHALL load and include that media for the remaining model iterations of the current turn

#### Scenario: Historical packet is not replayed

- **WHEN** a later user-authored or internal-continuation turn begins after a multimodal context packet
- **THEN** provider projection MUST NOT include media from that historical packet

#### Scenario: Historical tool media is not reloaded

- **WHEN** a later user-authored or internal-continuation turn begins after a tool-produced perception card
- **THEN** provider projection MUST NOT invoke the media loader for that historical card
- **AND** it MUST NOT append a synthetic provider media message for that card

### Requirement: Durable perception history remains compact and grounded

Agent conversation history SHALL retain structural and semantic perception evidence plus stable resource identity without requiring media bytes to be replayed on every subsequent model call.

#### Scenario: Follow-up turn consumes compact evidence

- **WHEN** a prior perception card contains structural or semantic evidence
- **AND** a later text-only turn does not explicitly reinspect the media
- **THEN** the evidence SHALL remain available through the historical tool result
- **AND** provider projection SHALL NOT expand its perceptual references into binary media input

#### Scenario: Historical evidence has no usable media reference

- **WHEN** a historical perception card lacks a provider-loadable reference
- **THEN** the later turn SHALL continue to consume its available compact evidence
- **AND** projection SHALL NOT report a current-turn media availability failure

### Requirement: Media reinspection is explicit and canonical

After the originating turn, Agent SHALL reacquire media bytes only through an explicit current-turn media read or perception operation using stable resource identity.

#### Scenario: Explicit reinspection makes selected media current

- **WHEN** a later turn explicitly reads or perceives one historical resource
- **THEN** the newly produced current-turn perception card SHALL be eligible for provider media projection
- **AND** unrelated historical media MUST NOT be reloaded

#### Scenario: Reinspection dependency is unavailable

- **WHEN** an explicit current-turn media read produces a provider-loadable reference but the selected chat model requires bytes that cannot be loaded
- **THEN** the turn SHALL fail with the existing typed native multimodal availability diagnostic
- **AND** it MUST NOT fall back to historical media or return an empty success

### Requirement: Media lifecycle paths are observable and testable

The Agent media-context lifecycle SHALL provide path-level evidence that distinguishes current-turn projection, compact historical evidence, explicit reinspection, and forbidden historical replay.

#### Scenario: Multi-turn no-replay acceptance

- **WHEN** an Evaluation case analyzes fixture media and then sends a text-only follow-up through the complete Agent session owner
- **THEN** evidence SHALL identify the effective chat and understanding models
- **AND** it SHALL prove the follow-up projected no historical media payload or historical media-loader invocation

#### Scenario: Explicit reinspection acceptance

- **WHEN** an Evaluation case explicitly reinspects one stable fixture resource in a later turn
- **THEN** evidence SHALL prove that the current-turn canonical read or perception path was used
- **AND** it SHALL prove unrelated historical media and fallback paths did not participate
