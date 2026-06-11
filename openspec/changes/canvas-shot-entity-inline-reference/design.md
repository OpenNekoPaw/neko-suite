## Context

The ADR rejects automatic Canvas entity subgraph projection. Canvas remains a visual storyboard workbench and displays entity context inline in shot character rows, Hover Card, Quick Panel, and optional Inspector. The entity service remains the owner of candidates and confirmed facts.

Current `ShotCharacter` has `characterName` and optional `entityRef`, but not `candidateId`. Existing candidate data has `candidateId` in review-only structures, which is insufficient for precise confirm backfill into shot rows.

## Goals / Non-Goals

**Goals:**

- Add `candidateId?: string` to shot characters and preserve backward compatibility.
- Ensure Agent one-click Send to Canvas waits for entity contribution result or timeout before assembling payload.
- Inject `entityRef` or `candidateId` into Canvas payload when stable mapping is available.
- Add Canvas host message routes for entity summary, confirmation, and inspector trigger.
- Render shot characters in confirmed/candidate/unlinked/ambiguous states.
- Backfill `entityRef` after candidate confirmation by matching `candidateId`.

**Non-Goals:**

- Do not create confirmed entities from Canvas import.
- Do not project `entity`, `representation-slot`, `occurrence`, or `generated-asset` subgraphs automatically.
- Do not implement the full Entity Inspector Panel here.
- Do not implement orphan asset lifecycle here.

## Decisions

### Decision 1: Payload assembly is ordered, not blindly parallel

StoryboardDeliveryService first processes entity contributions, then injects `entityRef` or `candidateId`, then imports storyboard. If entity processing times out, storyboard import may continue with `characterName` only and an explicit diagnostic.

### Decision 2: Mapping keys are explicit

Decision-to-shot mapping prefers storyboard character id, then shot/character tuple, then provenance, and uses name only as a last fallback. Ambiguous names produce diagnostics rather than automatic writes.

### Decision 3: Canvas routes entity actions through host messages

Canvas Webview does not import entity service or call VSCode APIs. It sends `postMessage` to its Extension Host, which invokes entity facade commands and returns summaries/results.

### Decision 4: Confirm backfill uses existing entity change event shape

Backfill reads `CreativeEntityChangeEvent.changedRefs[]` where `kind === "candidate"` and `entityRef` is present. Canvas updates shot characters with matching `candidateId`.

## Risks / Trade-offs

- **Risk: entity contribution timeout leaves unlinked shots.** -> Surface `unlinked` or `candidate-ambiguous` diagnostics and allow manual association or explicit candidateId backfill.
- **Risk: Canvas host route becomes broad.** -> Keep P0 route set narrow: summary, confirm, inspect.
- **Risk: event bus instance mismatch.** -> Depend on entity-binding-widget-facade project-scoped runtime/event sharing.
- **Risk: mapping keys missing from Agent output.** -> Import remains safe but does not claim automatic confirm backfill.

## Migration Plan

1. Add optional `candidateId` to shared shot character contracts and validators.
2. Update storyboard-to-canvas projection helpers to preserve `entityRef` and optional `candidateId`.
3. Implement delivery ordering and diagnostics in Agent.
4. Add Canvas host routes and shot row/Hover Card rendering.
5. Add confirm backfill listener and focused tests.
