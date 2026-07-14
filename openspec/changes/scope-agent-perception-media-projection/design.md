## Context

Provider-aware projection currently scans the complete chat history for the latest serialized `MultimodalContextPacket` and for every tool-result `PerceptionCard`. It then synthesizes a final user message and, when the selected chat model supports the modality, reloads provider-ready media from every collected card. This is correct only while the Agent is still executing the turn that introduced the packet or produced the tool result. On a later user or internal-continuation turn, the same scan makes old media look current and reloads it again.

The existing architecture already separates two model paths: matching chat and understanding models use native multimodal context, while distinct models use a scoped perception call whose durable output is a `PerceptionCard`. The defect is lifecycle selection at the Platform projection boundary, not model routing, prompt wording, media loading, or the `PerceptionCard` schema.

## Goals / Non-Goals

**Goals:**

- Make native multimodal packets and tool-produced provider media consumable only within the Agent turn that introduced them.
- Preserve structural and semantic `PerceptionCard` evidence in normal tool-result history without reloading its media on later turns.
- Preserve explicit reinspection through `ReadImage` or `perception.perceive` as the canonical way to make selected media current again.
- Fail visibly when current-turn native media is required but unsupported or unavailable.
- Prove both the canonical current-turn path and the forbidden historical replay path with deterministic and real Agent evidence.

**Non-Goals:**

- Changing model-purpose configuration or the same-model versus distinct-model routing decision.
- Adding a second perception cache, a media token budget, silent image downsampling, provider-specific fallback, or automatic retry.
- Changing `PerceptionCard`, `ResourceRef`, conversation journal, Webview protocol, or persisted project formats.
- Removing historical tool results or semantic evidence from conversation history.

## Decisions

### Responsibility and lifecycle

The Platform shared-service adapter owns provider message projection and therefore owns deciding which already-persisted inputs are current for one provider call. Agent runtime remains the owner of turn ordering and message history; AI SDK remains the owner of converting an explicitly selected packet/card set into provider content; content access remains the owner of loading authorized bytes.

Projection SHALL derive one current turn segment from message order. The boundary is the latest user message that is not a serialized `MultimodalContextPacket`. Only packets and tool-result perception cards at or after that boundary are eligible for native provider-media expansion. Earlier packets and cards remain in their original compact historical messages and MUST NOT be re-expanded.

This uses the existing canonical message ordering instead of adding mutable consumed flags, a session singleton, a parallel attachment registry, or a new durable schema.

### Current-turn packet selection

Replace the history-wide latest-packet lookup with current-turn lookup. A packet serialized after the latest ordinary user input belongs to that turn. If a message list consists only of a packet, that packet is current so direct service callers retain the existing valid path. Once a later ordinary user or internal-continuation message exists, the old packet is historical.

Alternative rejected: remove packet messages after their first provider call. A turn can contain multiple model/tool iterations, so destructive one-call consumption would remove media before the same turn finishes.

### Current-turn perception-card selection

Collect and deduplicate only tool-result cards produced after the current turn boundary. These cards may be expanded for the same turn because a native-vision chat model needs to see the result of a `ReadImage` call before it can respond. On the next turn, their original tool-result JSON still supplies structural and semantic evidence, but no synthetic media message is appended.

Alternative rejected: never expand tool cards. That would break the canonical same-model `ReadImage` flow where the tool exposes an authorized resource and the chat model performs the visual interpretation.

Alternative rejected: expand all cards but omit base64 after a size threshold. That retains incorrect lifecycle semantics and makes correctness depend on payload size.

### Interface and dependency direction

No public DTO is added. Pure selection helpers remain package-local to `@neko/platform` because this is provider projection policy with one owner and no external implementation. The existing `MultimodalContextPacket`, `PerceptionCard`, loader, model capability resolver, and AI SDK projection functions remain canonical.

The change reduces coupling by preventing durable evidence from implicitly invoking content access. Explicit current-turn projection continues to call the injected loader through the existing port.

### Fail-visible behavior

Current-turn native inputs retain the existing unsupported-modality and unavailable-asset errors. Historical media does not attempt loading, so it cannot manufacture a current-turn loader error. Malformed packet/tool-result JSON remains non-projectable history and is not treated as successful media evidence.

### Testing and Evaluation

Deterministic Platform tests will cover:

- current-turn serialized packet native projection;
- current-turn tool card expansion and authorized loader invocation;
- later text-only turn with a poisoned loader proving historical media is not reloaded;
- later turn retaining original compact semantic evidence;
- explicit later `ReadImage`/perception tool result making only the newly selected card current;
- current-turn unsupported/unavailable media remaining fail-visible.

The Agent Evaluation authoring decision is `create` unless the repository change-to-suite mapping identifies an existing multi-turn media-understanding owner. The focused real case must drive the complete TUI session: analyze fixture media, send a text-only follow-up, and assert provider projection facts prove zero historical media reload. A boundary case explicitly reinspects one resource and proves only that selected current-turn media is loaded. If current runtime facts do not expose media-load or provider-input counts, the case is blocked pending the smallest neutral observability fact rather than relying on final text.

### Five-layer analysis

- **Responsibility:** Agent owns turn history; Platform owns current provider projection; AI SDK owns wire conversion; content access owns bytes; perception owns evidence.
- **Dependency:** No new Layer 0 contract or Extension/Webview dependency is introduced. Platform continues depending on shared contracts and AI SDK projection.
- **Interface:** Existing message roles and typed packets/cards are sufficient; turn scope is derived from canonical ordering.
- **Extension:** Other media modalities follow the same segment rule without modality-specific branches or new registries.
- **Testing:** Pure selection behavior is deterministic; provider loading is verified with spies/poisoned loaders; complete multi-turn behavior requires focused Evaluation evidence.

## Risks / Trade-offs

- **Risk: A host appends a packet before its ordinary user message.** → Existing Agent assembly appends turn context after the prompt; tests will lock down this ordering. Non-canonical callers must supply the same ordering rather than receive a fallback.
- **Risk: Internal continuation identity is represented with role `user`.** → Treating it as a new boundary is intentional: continuations consume durable task/perception evidence and must explicitly reinspect bytes when necessary.
- **Risk: Semantic evidence inside large historical tool JSON still consumes text context.** → This change removes binary replay. General history compaction and tool-result summarization remain separate concerns.
- **Risk: Current-turn batches can still be large.** → The user explicitly requested that media be analyzed in that turn; separate bounded selection/preprocessing policies govern batch size.

## Migration Plan

1. Add red-capable tests that reproduce historical packet/card replay with a poisoned loader.
2. Replace history-wide packet/card selection with current-turn segment selection.
3. Keep the existing current-turn native and tool-result projection path unchanged behind the corrected selector.
4. Run focused package tests, type/build gates, Agent Evaluation validation, and a real TUI case when provider credentials and fixture media are available.

Rollback is a code revert. No stored user data or project format is migrated. Old journals become safer automatically because historical cards remain readable but stop causing implicit byte reload.

## Open Questions

- Whether current Evaluation facts already expose provider-projected media counts and loader invocations; this must be audited before authoring the real case.
