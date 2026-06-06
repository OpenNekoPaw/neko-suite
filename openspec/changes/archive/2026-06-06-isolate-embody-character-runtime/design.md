## Context

The current role-workflow migration already clarified product terms:

```text
Character Dialogue: Agent plays the character; user tests.
Embody Character:   User plays the character; Agent gives project knowledge feedback.
Character Validation / Improvement: Skills compose core primitives.
```

However, the current implementation of `embody-character` only creates an ordinary conversation tab with an implicit `AgentContextPayload`. That fixes the visible prompt problem, but it does not isolate capabilities: the message still enters the ordinary Agent turn pipeline, where skill activation and creative tools remain available. The screenshot where "记录今天的日记" activated `creation-persona` is the expected failure mode of that architecture.

This proposal is a follow-up correction to the role-workflow migration. It supersedes the earlier assumption that `embody-character` should be an ordinary Agent workflow.

Five-layer analysis:

- Responsibilities: Dashboard presents and delegates entity actions; Extension owns command/session lifecycle; Agent runtime owns session semantics and capability policy; Webview only renders session projections and sends typed user events.
- Dependencies: Webview MUST NOT enforce permissions. LLM tool access is decided before responder execution by controller/runtime ports.
- Interfaces: Embody Character gets its own session projection and route, but reuses profile/evidence DTOs and the existing character role artifact vocabulary where practical.
- Extension: future role modes can share a role-session shell while swapping responder semantics and capability policy.
- Testing: runtime tests cover policy, extension tests cover command/message routing, Webview tests cover controls/state, and dashboard tests cover action delegation.

## Goals / Non-Goals

**Goals:**

- Make `embody-character` a dedicated isolated feedback session, not ordinary creative chat.
- Reuse the Character Dialogue architecture where it reduces duplication: session lifecycle, tab projection, route/exit wiring, profile assembly, transcript capture, and tests.
- Prevent creative skills and authoring tools from being available in Embody Character.
- Preserve project-aware feedback by injecting read-only character evidence through controller/runtime ports.
- Ensure user messages such as "记录今天的日记" produce role-knowledge or mode-boundary feedback, not creation-persona activation or artifact mutation.
- Keep Character Dialogue no-tool roleplay unchanged.

**Non-Goals:**

- Reintroducing validation or improvement as Dashboard core actions.
- Giving the user a persistent global persona outside the Embody Character tab.
- Allowing Embody Character to mutate character facts, write files, generate assets, record diary entries, create tasks, or call creative persona skills.
- Backwards compatibility with the hidden-context-only implementation.
- Automatically migrating historical ordinary conversations that were started through the old Embody Character path.

## Decisions

### 1. Reuse the role-session shell, not ordinary Agent conversation

Create an Embody Character session path parallel to Character Dialogue:

```text
Dashboard action / command
  -> ChatViewProvider.startEmbodyCharacter()
  -> EmbodyCharacterController.launch()
  -> EmbodyCharacterSession
  -> message router routeUserMessage()
  -> restricted feedback responder
```

The role-session shell can share tab creation, profile assembly, active-session lookup, exit lifecycle, and transcript helpers with Character Dialogue. The responder semantics stay separate.

Alternative considered: keep ordinary Agent conversation and add stronger prompt text. Rejected because prompt-only control already failed; `ActivateSkill` remained available.

### 2. Use projected evidence instead of general LLM tools

The Embody Character responder receives assembled character profile and read-only evidence snapshots. It does not receive general tools, skill activation tools, file write tools, media tools, task tools, or entity mutation tools.

Controller/runtime may call narrow host-side read-only ports before launch or before a turn:

```ts
interface EmbodyCharacterEvidenceReader {
  assembleProfile(input): Promise<NpcProfileAssemblyResult>;
  collectRelationships(entityRef): Promise<readonly Relationship[]>;
  collectOccurrences(entityRef): Promise<readonly Occurrence[]>;
  collectSceneEvidence(entityRef): Promise<readonly NpcProfileFact[]>;
}
```

Alternative considered: expose a read-only tool registry to the LLM. Deferred because the immediate bug is capability leakage; projected evidence is safer and easier to test.

### 3. Define an explicit feedback capability policy

Introduce a mode policy such as:

```ts
type CharacterRoleCapabilityPolicy =
  | { kind: 'none' }
  | { kind: 'character-feedback-readonly' };
```

`character-feedback-readonly` means:

- LLM-facing tools: none, unless a future tool is explicitly classified as read-only character evidence.
- Skills: `ActivateSkill` and persona skills are unavailable.
- Commands/actions: no write, generation, task mutation, entity mutation, or shell/file-write execution.
- Host-side evidence hydration: allowed through injected read-only ports.

Alternative considered: reuse `toolPolicy: { kind: 'none' }` exactly. This is safe for LLM tools, but naming a dedicated policy documents why evidence can still be pre-hydrated by the controller.

### 4. Keep response semantics different from Character Dialogue

Character Dialogue responder speaks as the character. Embody Character responder never speaks as the character. It responds as a feedback coach and classifies the user's roleplay statements:

- confirmed by project evidence
- inferred but not confirmed
- unknown / insufficient evidence
- out-of-scope for the character
- mode violation when the user asks for creative execution

Example: if the user says "记录今天的日记", the response should not record anything. It should explain that writing or diary creation is unavailable in Embody Character and may optionally evaluate whether the request fits the character's known voice or knowledge.

### 5. No compatibility bridge

The old hidden-context ordinary Agent route is removed. `neko.agent.embodyCharacter` always starts the isolated Embody Character session. Existing action ids and command names from the role terminology migration remain; only the runtime semantics change.

## Risks / Trade-offs

- Reduced creative convenience inside Embody Character -> mitigated by clear exit flow back to ordinary Agent chat for authoring.
- Evidence may be stale if assembled only at launch -> mitigate by allowing read-only evidence refresh before each turn if the source supports it.
- More session/controller code -> mitigate by extracting shared Character Role shell helpers only where duplication becomes real.
- Conflicts with the prior migration spec text that said "ordinary Agent workflow" -> mitigate by marking this change as the follow-up correction and updating docs/spec references during implementation.
- Some users may expect the Agent to write content while they embody a character -> mitigate with header copy and refusal text that names the mode boundary.

## Migration Plan

1. Add shared projection and protocol contracts for an Embody Character session, replacing the hidden-context-only projection.
2. Add `EmbodyCharacterSession` runtime and feedback responder contracts.
3. Add read-only evidence reader ports and use existing character profile assembly where available.
4. Add `EmbodyCharacterController` in the Extension and route `neko.agent.embodyCharacter` through it.
5. Update Webview route/header/input behavior to treat `embody-character` as an isolated session kind.
6. Remove the ordinary Agent message path for Embody Character.
7. Update Dashboard delegation expectations and docs.
8. Run targeted runtime, extension, Webview, Dashboard, and shared contract tests.

Rollback is branch-level only. Do not ship both the ordinary Agent and isolated session implementations for `embody-character`.

## Open Questions

- Whether Embody Character transcripts should be saved automatically, on ask, or never by default. The initial implementation should keep the transcript in-session and may reuse the Character Dialogue save-policy hook if already available.
- Whether future read-only evidence tools are needed after projected evidence proves insufficient. This change should start with projected evidence and no LLM-facing tools.
