## Why

Long-form comic-to-animation workflows need character consistency across many partial inputs: scripts, comics, videos, generated images, voice outputs, and later user edits. The current unified creative entity system provides stable identity and asset bindings, but it does not yet provide an append-only evidence layer, time-scoped character state, or structured voice cue linkage that can survive limited Agent context.

This change introduces a progressive character memory layer that reuses `CreativeEntityRef` as identity and records observations, drafts, state snapshots, and change events as reviewable project facts.

## What Changes

- Add a progressive character memory contract for source segments, character observations, evidence ledger records, profile drafts, state snapshots, and change events.
- Add entity-matching and review semantics so extracted traits remain suggestions until confirmed or source-approved.
- Add generation-context requirements so image/video/TTS workflows resolve character visual and voice representations before execution.
- Extend storyboard projection requirements so per-shot character role, action, emotion, continuity, entity identity, and structured voice cues are preserved across Agent, Canvas, and Cut where supported.
- Clarify that progressive memory builds on the existing unified entity system and MUST NOT create a parallel character identity store.
- Keep lip-sync and ML voice generation engines out of scope while defining the cue-to-voice binding needed by future voice-pack and lip-sync work.

## Capabilities

### New Capabilities

- `progressive-character-memory`: Persistent contracts and workflows for extracting, reviewing, evolving, and using character observations and time-scoped state across long-form creative workflows.

### Modified Capabilities

- `creative-entity-asset-composition`: Add requirements that progressive memory uses `CreativeEntityRef`, entity candidates, representation resolution, and bindings rather than a parallel identity or asset system.
- `agent-storyboard-table-contract`: Add requirements for preserving structured character participation and voice cues from storyboard artifacts through Canvas and Cut projections.
- `voice-pack-lipsync-roadmap`: Add requirements that structured voice cues bind to entity voice representations without requiring production lip-sync implementation in this change.

## Impact

- Shared contracts in `packages/neko-types/src/types/` for character observations, evidence ledger files, state snapshots, change events, entity mentions, and voice cues.
- Validators and tests for JSON-serializable, project-safe, bounded memory records.
- Storyboard, Canvas, Cut, and Agent projection paths that currently flatten character and dialogue data.
- Agent Skills and prompts for comic-to-animation extraction, including optional profile fields for character appearance, voice intent, and continuity notes.
- Entity/asset services and generation runtimes that can resolve portrait/reference/voice representations before media generation.
- No new external runtime dependency is required.
