## Context

The stable boundary is now captured by `docs/architecture/adr-agent-skill-catalog-activation-boundary.md`:

```text
User message
  -> Agent inspects registered Skill catalog through GetContext when needed
  -> Agent decides whether to call ActivateSkill
  -> Runtime validates and injects through the canonical Skill owner
```

Code-side candidates and Webview candidate chips are intentionally removed. Skill metadata remains valuable, but its consumer is the Agent context, not a pre-turn router.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Agent owns the activation decision. Runtime owns validation and injection. Extension/Webview own explicit dispatch and projection only. |
| Dependency | Skill catalog metadata stays in shared Skill contracts. Agent meta tools project metadata. Webview and Extension no longer depend on candidate DTOs. |
| Interface | `GetContext.registeredSkills` is the read interface. `ActivateSkill`, `$skill`, and `invokeSkill` are the activation interfaces. |
| Extension | User-added Skills join by registry/catalog metadata, not by production code branches. Future search tools may be read-only catalog helpers. |
| Testing | Tests assert natural language does not inject Skill or emit `skillCandidates`; explicit activation still injects through runtime. |

### Architecture answers

1. **Does this fit the existing architecture?** Yes. It strengthens Agent-first and keeps `SkillInjectionCoordinator` as the injection owner.
2. **How does this reduce coupling?** Skill-specific routing leaves Extension/Webview code. Skill semantics live in metadata and prompt-visible catalog context.
3. **Is it easy to extend and test?** Yes. New Skills add metadata; tests cover `GetContext` catalog projection and explicit activation paths without scoring fixtures.

## Goals / Non-Goals

**Goals:**

- Remove natural-language pre-turn Skill routing and candidate UI.
- Let Agent reason over Skill catalog metadata through `GetContext`.
- Preserve explicit Skill activation through `$skill`, `invokeSkill`, and `ActivateSkill`.
- Keep runtime validation for disabled Skills, missing content, required tools/subpackages, and trust boundaries.
- Support user-added Skills through metadata that is visible to Agent context.

**Non-Goals:**

- Implement model-internal MoE.
- Add a second routing Agent.
- Add Webview candidate chips or user selection for model-suggested candidates.
- Add embeddings or LLM reranking in code.
- Replace `SkillInjectionCoordinator` or duplicate prompt/tool injection logic.

## Decisions

### 1. Delete code-side candidate routing

Natural-language user input must not call a candidate resolver, mutate candidate state, or post `skillCandidates`. The Agent receives the user request directly and may call `GetContext` / `ActivateSkill`.

Alternative rejected: keep candidates as suggestions only. This still leaves code as a pre-Agent router and creates a manual user choice step that contradicts Agent-autonomous activation.

### 2. Keep metadata as catalog material

`mediaWorkflow.useCases`, `nonGoals`, `inputArtifacts`, `producedArtifacts`, and `operations` remain useful, but their purpose is to help the Agent understand registered Skills. They are not scoring rules owned by TypeScript code.

Alternative rejected: delete metadata with the router. That would make user-added Skills harder for Agent to understand and would regress catalog quality.

### 3. `GetContext` exposes catalog, not candidates

`GetContext` returns active Skill, registered Skills, related Skills, media workflow hints, and tool categories. It does not include `skillCandidateHints`.

Alternative rejected: put candidate summaries into `GetContext`. That preserves the old router boundary under a different surface.

### 4. Webview displays active Skill only

Webview keeps the active Skill indicator and explicit `$skill` menu. It does not display code-generated candidate chips.

Alternative rejected: show candidates in the header or composer. That invites the user to manually choose what the Agent should decide.

## Risks / Trade-offs

- [Risk] Agent may miss a useful Skill. -> Mitigation: enrich Skill metadata and prompt guidance; keep `$skill` explicit fallback.
- [Risk] Very large catalogs may become noisy. -> Mitigation: future read-only catalog search can narrow metadata without activation side effects.
- [Risk] Existing tests expect candidates. -> Mitigation: update tests to assert no candidate protocol and explicit activation success.

## Migration Plan

1. Remove shared candidate DTOs and Webview `skillCandidates` protocol.
2. Remove Agent candidate router/capability-card files and runtime candidate state.
3. Remove Extension pre-turn candidate resolution.
4. Remove Webview candidate chips, state, CSS, and i18n.
5. Keep and validate Skill metadata in builtins/docs.
6. Update ADR/OpenSpec/package docs.
7. Run focused compile/tests and boundary checks.
