# audio-tempo-grid Specification

## Purpose
Define audio tempo-map, beat-grid, tick conversion, BPM editing, display, and snapping requirements.
## Requirements
### Requirement: Audio projects own a beat-grid TempoMap
The system SHALL support `.nka` v2.2 projects with `AudioProjectData.tempoMap` as the source of truth for musical time when present. A valid `TempoMap` MUST include serialized `ppq`, at least one tempo event at ticks `0`, and at least one time signature event at ticks `0`.

#### Scenario: v2.2 project loads tempo map
- **WHEN** a `.nka` v2.2 project contains a valid `tempoMap`
- **THEN** the codec loads it into `AudioProjectData.tempoMap` and consumers prefer it over the legacy `bpm` field

#### Scenario: legacy project derives tempo map
- **WHEN** a `.nka` project has no `tempoMap`
- **THEN** the loader derives a default `TempoMap` using `bpm ?? 120`, `ppq = 480`, and an initial `4/4` time signature at ticks `0`

### Requirement: Tempo conversion functions are shared and deterministic
The system SHALL provide pure shared functions for `ticksToSeconds`, `secondsToTicks`, `ticksToBarBeat`, and `barBeatToTicks`. `secondsToTicks` MUST round to the nearest integer tick, and bars/beats MUST be 1-based while the residual tick is 0-based within the active beat.

#### Scenario: conversion round trip uses nearest tick
- **WHEN** a caller converts seconds to ticks and back using the same `TempoMap`
- **THEN** the resulting seconds are within one tick of the original time

#### Scenario: beat residual respects denominator
- **WHEN** `ticksToBarBeat` converts ticks under a `6/8` time signature with `ppq = 480`
- **THEN** the returned residual tick range is `[0, 240)` because each beat is an eighth note

### Requirement: BPM editing remains compatible with TempoMap
The system SHALL keep `audio.setBpm` as the single-tempo edit operation while `tempoMap` is present. Applying `audio.setBpm` to a v2.2 project MUST update `tempoMap.tempoEvents[0].bpm`; saving MUST backfill the legacy `bpm` field from that first tempo event for compatibility.

#### Scenario: setBpm updates first tempo event
- **WHEN** the Webview dispatches `audio.setBpm` on a project with `tempoMap`
- **THEN** the operation apply path updates `tempoMap.tempoEvents[0].bpm` and undo restores the previous value

#### Scenario: saved v2.2 file backfills bpm
- **WHEN** a v2.2 project is saved with `tempoMap.tempoEvents[0].bpm = 142`
- **THEN** the serialized `.nka` includes `tempoMap` and backfills `bpm` with `142`

### Requirement: Audio timeline supports beat-grid display and snapping
The system SHALL expose bars/beats display and snap/grid behavior based on the current `TempoMap`. Snap operations MUST convert interaction seconds to ticks, snap in tick space, and convert back to seconds for existing timeline element placement.

#### Scenario: timeline ruler displays bars and beats
- **WHEN** project mode is active and a valid `TempoMap` exists
- **THEN** the timeline ruler and transport may display musical positions using the `bar:beat:tick` convention

#### Scenario: clip move snaps to beat
- **WHEN** snap-to-beat is enabled and a user drags an audio clip near a beat boundary
- **THEN** the committed `element.startTime` corresponds to the snapped tick position converted through the shared tempo function
