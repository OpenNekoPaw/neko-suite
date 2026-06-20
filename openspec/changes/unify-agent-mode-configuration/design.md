## Context

Neko Agent currently has a shared `SessionMode` contract for `agent`, `image`, `video`, and `audio`. The Webview composer already routes Agent turns and direct media generation through the same bottom input area, but the control model is uneven:

- Agent mode shows an LLM selector and execution mode, while detailed LLM behavior remains mostly global settings.
- Media modes expose model and generation parameters near the input, so they feel more actionable and creator-facing.
- Existing capability work in `capability-driven-agent-models` establishes broad model categories and capability metadata, but it does not define a unified composer configuration surface or Agent LLM preset/model-slot contract.

This change stays within the local VS Code Extension/Webview product boundary. It does not add a remote workflow platform, distributed scheduler, or Rust Engine contract. The change is primarily `neko-agent` contracts, Webview projection, Extension validation, and platform adapter mapping.

Five-layer analysis:

- Responsibility: `agent-types` owns DTOs and parsers for Agent configuration payloads; Platform owns model capability normalization and provider parameter mapping; Extension validates boundary messages and resolves configured/default models; Webview owns composer presentation and user interaction; Agent runtime consumes normalized turn settings without knowing UI details.
- Dependency: Layer 0 shared contracts remain dependency-light. Webview does not import Extension or provider adapters. Extension does not import React. Provider-specific mapping stays in Platform/adapters, not Webview.
- Interface: new DTOs are small and explicit: Agent model slots, preset values, optional resolved provider parameters, and diagnostics. Webview messages carry only selected refs and normalized user intent, not secrets or raw provider config.
- Extension: adding a future model slot or provider parameter requires updating the capability registry and projection rules, not copying UI branches across each mode.
- Testing: presenter tests cover UI projection; protocol tests cover accepted/rejected payloads; Platform tests cover capability/preset mapping; Extension router tests cover diagnostics; Webview tests cover layout, keyboard/focus, i18n, and mode-specific command visibility; runtime smoke uses VS Code Webview validation.
- Proportionality: the abstraction is limited to the composer and Agent turn configuration because this is a local client workflow. It avoids a general workflow engine and avoids arbitrary provider parameter pass-through.
- Fail-visible behavior: unknown slots, unsupported preset values, provider capability mismatches, illegal message payloads, and unsupported provider parameter requests are rejected or surfaced as diagnostics rather than silently falling back.

## Goals / Non-Goals

**Goals:**

- Present one consistent composer model: left side selects creative mode, right side configures the active mode.
- Move commonly adjusted Agent LLM behavior into the composer through user-facing presets.
- Define Agent model slots so future multi-model orchestration has a stable contract.
- Use model/provider capabilities to decide which controls are available and which send payloads are legal.
- Preserve direct media generation controls and existing `@` reference behavior.
- Keep unsupported `/` and `$` command affordances hidden in direct generation and roleplay contexts.

**Non-Goals:**

- No dynamic per-step multi-model scheduler in the MVP.
- No arbitrary provider parameter editor in the composer.
- No user-authored TOML DSL for capability mappings, provider transforms, or workflow profiles.
- No new model categories beyond broad `llm`, `image`, `video`, and `audio`.
- No Rust Engine or project file changes.
- No compatibility fallback that silently drops unsupported LLM parameters.

## Decisions

1. Use a mode/config split in the composer with independent parameter chips.

   The composer top row becomes a stable two-part control:

   ```text
   [Mode selector: Agent | Image | Video | Audio] [Active mode configuration chips]
   ```

   Each adjustable value is its own compact dropdown. Agent mode separates model choices from Agent behavior parameters:

   ```text
   Models: GPT 5.5 · Image Model · Video Model · Audio Model
   Agent: Balanced · Standard · Creative
   ```

   Direct media modes expose the selected generation model and the relevant media parameters as sibling dropdowns:

   ```text
   GPT Image · 16:9 · 1080p
   ```

   Execution mode (`plan`, `ask`, `auto`) stays in the bottom runtime toolbar near send/tools because it controls action approval, not model or Agent behavior configuration.

   Alternative considered: keep separate Agent and media layouts. Rejected because it reinforces a false product split and makes future entry-page reuse harder.

   Alternative considered: put Agent model, presets, and execution mode in one configuration popover. Rejected because the composer should behave like the media parameter controls: each frequently changed parameter is directly reachable, and execution approval should remain with runtime controls.

2. Keep `SessionMode` as the top-level workflow selector.

   `agent` remains LLM reasoning plus tools. `image`, `video`, and `audio` remain direct media generation routes. The UI is unified, but runtime semantics stay explicit.

   Alternative considered: make generation a subtype inside Agent mode. Rejected because direct media generation has different model refs, parameter schemas, task lifecycle, and result cards.

3. Represent Agent LLM behavior as presets plus advanced raw values.

   User-facing presets:

   ```ts
   type AgentReasoningPreset = 'fast' | 'balanced' | 'deep';
   type AgentVerbosityPreset = 'brief' | 'standard' | 'detailed';
   type AgentCreativityPreset = 'stable' | 'creative' | 'wild';
   ```

   Presets map to provider-specific request fields only when the selected model supports them. Advanced values are stored as explicit optional overrides such as `temperature`, `topP`, `maxOutputTokens`, `reasoningEffort`, `thinkingBudget`, `verbosity`, and `serviceTier`.

   Alternative considered: expose only raw provider parameters. Rejected because creator-facing users should not need to understand every provider's vocabulary, and raw parameters are not portable.

4. Add Agent model slots, but keep orchestration conservative.

   Contract:

   ```ts
   type AgentModelSlot = 'primary' | 'fast' | 'deep' | 'summarizer' | 'vision';
   type AgentModelSlots = Partial<Record<AgentModelSlot, ModelRef<'llm'>>>;
   ```

   MVP behavior:

   - `primary` is used for normal Agent turns.
   - Additional slots can be configured in an advanced area only if the runtime path has explicit support.
   - If a slot is referenced but unsupported by the current runtime path, the Extension returns a diagnostic.
   - Missing optional slots do not fail; they inherit `primary` only when the runtime explicitly asks for an optional slot and records that decision.

   Alternative considered: immediately route each Agent subtask to separate slots. Rejected because that is a runtime workflow change and should be implemented only after the UI/contract is stable.

5. Use capability-aware controls and validation.

   Extend capability projection to expose feature flags for LLM controls:

   ```ts
   interface LlmModelCapabilities {
     supportsTools: boolean;
     supportsVision: boolean;
     supportsReasoningEffort: boolean;
     reasoningEffortValues?: Array<'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'>;
     supportsThinkingBudget: boolean;
     supportsVerbosity: boolean;
     supportsTemperature: boolean;
     supportsTopP: boolean;
     supportsFastTier: boolean;
   }
   ```

   Controls that cannot be honored are hidden or disabled with explanatory text. Send payloads are still validated at the Extension boundary so stale Webview state or crafted messages cannot bypass capability checks.

   Alternative considered: rely on provider API errors. Rejected because it creates poor UX and hides contract drift until runtime.

6. Keep provider mapping outside the Webview.

   The Webview sends normalized intent:

   ```ts
   interface AgentLlmConfig {
     reasoningPreset?: AgentReasoningPreset;
     verbosityPreset?: AgentVerbosityPreset;
     creativityPreset?: AgentCreativityPreset;
     advanced?: AgentLlmAdvancedParams;
   }
   ```

   Platform/adapters translate to provider request options:

   - OpenAI Responses-compatible: map reasoning to `reasoning.effort`, verbosity to `text.verbosity`, creativity to `temperature`, and fast tier only where the provider/config supports it.
   - Anthropic-compatible: map supported thinking controls to thinking budget/effort where available, and enforce provider restrictions on sampling parameters.
   - Generic OpenAI-compatible: use conservative `temperature`, `topP`, `maxTokens` only unless capabilities declare reasoning/verbosity support.
   - Local/Ollama: expose only known supported controls unless model metadata declares more.

   Alternative considered: encode OpenAI/Anthropic branching in React components. Rejected because it would couple UI to providers and duplicate adapter knowledge.

7. Store MVP settings at the right lifecycle.

   Composer choices are session-scoped first. Persisted defaults can be added once the interaction is validated:

   - Webview state owns active tab/session selections.
   - Config snapshot provides default primary model and default media models.
   - Future user config can persist Agent preset defaults and model slots after the contract is proven.

   Alternative considered: immediately rewrite user TOML when users change composer controls. Rejected because composer experimentation should not mutate durable config implicitly.

## Risks / Trade-offs

- [Risk] The unified composer may become visually crowded. -> Mitigation: use compact chips, separate model and Agent parameter groups, and allow the row to wrap instead of opening a single large configuration panel.
- [Risk] Provider capability metadata may be incomplete for custom endpoints. -> Mitigation: default to conservative controls and let users declare capabilities explicitly in config; unsupported controls remain hidden.
- [Risk] Preset names may not map perfectly across providers. -> Mitigation: presets describe product intent, while provider mapping remains capability-checked and test-covered.
- [Risk] Multi-model slots imply orchestration the runtime does not yet perform. -> Mitigation: define the contract but only activate slots where runtime has explicit support; otherwise show disabled/experimental UI or diagnostics.
- [Risk] Existing tests expect old composer grouping. -> Mitigation: update presenter and Webview tests around the new two-part control contract rather than brittle DOM shape.
- [Risk] Advanced users may want raw provider knobs. -> Mitigation: expose only common advanced fields now; provider-specific raw pass-through remains out of scope until there is a typed adapter-owned schema.

## Migration Plan

1. Add shared DTOs and parser validation for Agent model slots and LLM configuration.
2. Add pure projection helpers for composer mode/config summaries and control availability.
3. Replace composer top-row composition with the unified `ModeConfigBar` and active-mode configuration chips.
4. Wire Agent LLM config into send-message payloads and Extension validation.
5. Add Platform provider mapping with capability checks and fail-visible diagnostics.
6. Update tests and i18n.
7. Run targeted package checks plus VS Code Webview runtime smoke.

Rollback is local and prelaunch: revert the new composer presentation and payload fields if needed. Existing message fields remain enough to send Agent and media turns, but unsupported new fields must not be silently accepted after rollback.

## Open Questions

- Should Agent preset defaults be persisted in user config immediately, or remain session-scoped until users validate the workflow?
- Should additional Agent model slots be visible in MVP as disabled advanced controls, or hidden until runtime routing supports them?
- Which provider capability names should be considered authoritative for Anthropic adaptive thinking and fast service tiers in the first implementation pass?
