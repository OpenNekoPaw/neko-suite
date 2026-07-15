## ADDED Requirements

### Requirement: Waveform recovery requires a valid decoded prefix
The Engine SHALL recover waveform generation from a trailing corrupt audio packet sequence only when the decoder has already emitted valid audio output. Open failures, wholly undecodable media, and decoder errors without the qualifying corruption sequence MUST remain explicit failures.

#### Scenario: Corrupt trailing fragment follows valid audio
- **WHEN** waveform decoding emits valid audio frames and then encounters a contiguous corrupt-packet sequence that reaches the recovery condition
- **THEN** the Engine returns a waveform derived from the valid decoded prefix
- **AND** the Engine emits an explicit corrupt-tail recovery diagnostic

#### Scenario: Media has no valid decoded audio
- **WHEN** waveform decoding reaches the corrupt-packet safety limit before emitting any valid audio frame
- **THEN** the Engine returns an explicit decode failure
- **AND** it MUST NOT return an empty or all-zero waveform as a successful recovery

#### Scenario: Unrelated decoder failure
- **WHEN** FFmpeg returns `EPERM` or another terminal decoder error without an active corrupt-packet sequence after valid output
- **THEN** the Engine propagates the failure
- **AND** it MUST NOT classify the failure as a corrupt media tail

### Requirement: Corrupt packet processing is bounded
The Engine MUST bound work and warning volume for a contiguous corrupt-packet sequence during waveform generation. A successfully accepted packet SHALL reset the contiguous corruption state.

#### Scenario: Unfinished fragment exposes bogus packet entries
- **WHEN** a malformed fragmented-media sample table produces more consecutive invalid audio packets than the recovery budget
- **THEN** waveform decoding terminates the sequence without consuming the remaining unbounded bogus entries
- **AND** diagnostics report the recovery summary instead of one warning per remaining entry

#### Scenario: Isolated corrupt packet is followed by valid packets
- **WHEN** an invalid audio packet is skipped and a later packet is accepted before the recovery budget is reached
- **THEN** decoding continues on the canonical FFmpeg decoder path
- **AND** the invalid packet does not by itself truncate the waveform

### Requirement: Recovered waveform dimensions reflect decoded audio
When corrupt-tail recovery occurs, the Engine MUST derive waveform duration and peak-vector length from the audio samples actually decoded rather than untrusted source duration metadata.

#### Scenario: Corrupt container reports an inflated duration
- **WHEN** the source metadata reports a duration longer than the valid decoded prefix and corrupt-tail recovery occurs
- **THEN** waveform duration equals decoded sample count divided by output sample rate
- **AND** every channel contains `ceil(duration * peaksPerSecond)` peaks

#### Scenario: Clean media completes normally
- **WHEN** waveform decoding reaches normal EOF without corrupt-tail recovery
- **THEN** the Engine preserves the existing metadata-based waveform duration behavior

### Requirement: Recovery preserves the canonical Engine path and source bytes
Corrupt-tail waveform recovery SHALL execute inside the existing Engine decoder and waveform service path. The Engine MUST NOT modify the source media, and Webview or Extension callers MUST NOT generate a parallel fallback waveform.

#### Scenario: Cut requests waveform for damaged media
- **WHEN** Cut requests a waveform for a registered damaged media source
- **THEN** the existing Engine waveform action returns the recovered derived waveform
- **AND** the source file remains byte-for-byte unchanged
- **AND** no Webview-local decoder or waveform fallback participates
