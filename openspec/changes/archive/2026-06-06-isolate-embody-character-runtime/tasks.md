## 1. Shared Contracts

- [x] 1.1 Add or update shared tab/session projection contracts for an active/exited Embody Character feedback session.
- [x] 1.2 Add Webview protocol messages for Embody Character session start/exit if existing tab-state projection is insufficient.
- [x] 1.3 Remove hidden-context-only assumptions from `embody-character` contract tests.
- [x] 1.4 Add contract tests proving `embody-character` parses as an isolated session kind and does not masquerade as `chat` or `character-dialogue`.

## 2. Runtime And Capability Policy

- [x] 2.1 Add `EmbodyCharacterSession` runtime with profile snapshot, evidence snapshot, feedback transcript, active turn lifecycle, cancellation, and snapshot helpers.
- [x] 2.2 Add Embody Character responder input/result contracts that classify user roleplay claims as confirmed, inferred, unknown, out-of-scope, or mode-boundary.
- [x] 2.3 Add a `character-feedback-readonly` capability policy or equivalent runtime guard that blocks skill activation and creative tools.
- [x] 2.4 Add runtime tests proving `ActivateSkill`, `creation-persona`, write tools, media-generation tools, task mutation, and entity mutation are unavailable in Embody Character.
- [x] 2.5 Reuse or extract shared Character Role session helpers only where both Character Dialogue and Embody Character need the same lifecycle logic.

## 3. Evidence Projection

- [x] 3.1 Define read-only Embody Character evidence reader ports for profile assembly, relationships, occurrences, scene appearances, and script/evidence facts.
- [x] 3.2 Wire the evidence reader to existing character profile assembly and dashboard detail readers where available.
- [x] 3.3 Project evidence into the responder prompt/input without exposing general project/file mutation tools to the LLM.
- [x] 3.4 Add tests for thin profiles and missing evidence so the responder still returns bounded feedback instead of attempting creative execution.

## 4. Agent Extension

- [x] 4.1 Add `EmbodyCharacterController` or an explicit Embody path in a shared character-role controller.
- [x] 4.2 Route `neko.agent.embodyCharacter` to the isolated Embody Character controller instead of ordinary Agent message creation.
- [x] 4.3 Update Webview message routing so messages in an active Embody Character session call `routeUserMessage()` on the Embody controller.
- [x] 4.4 Add exit handling for active Embody Character sessions and ensure ordinary Agent chat resumes only after exit.
- [x] 4.5 Add extension tests proving "记录今天的日记" in Embody Character does not call ordinary Agent `handleUserMessage()` or skill activation paths.

## 5. Agent Webview

- [x] 5.1 Update Embody Character header to render session identity, scope, active/exited state, and exit action from the session projection.
- [x] 5.2 Remove implicit hidden context payload injection for active Embody Character tabs.
- [x] 5.3 Hide or disable ordinary creative model/mode/media controls for Embody Character just as mode-specific policy requires.
- [x] 5.4 Add Webview tests for Embody Character rendering, exit events, send-message routing, and absence of hidden user-visible prompts.

## 6. Dashboard And Entity Sources

- [x] 6.1 Keep the `embody-character` action id and labels, but update tests and docs so it delegates to an isolated feedback session.
- [x] 6.2 Ensure Dashboard does not assemble prompts, create sessions, or decide capability policy for Embody Character.
- [x] 6.3 Add Dashboard/entity source tests proving `embody-character` does not delegate to `character-dialogue` and does not create an ordinary creative chat request.

## 7. Documentation

- [x] 7.1 Update `docs/architecture/adr-npc-character-test-bench.md` to state that Embody Character reuses role-session architecture with read-only feedback capabilities.
- [x] 7.2 Update README/README_CN role workflow sections to explain when to use Character Dialogue versus Embody Character versus Skills.
- [x] 7.3 Update `migrate-character-role-workflows` notes or follow-up docs to supersede the old "ordinary Agent workflow" wording.

## 8. Validation

- [x] 8.1 Run targeted runtime tests for Embody Character session and capability policy.
- [x] 8.2 Run targeted extension tests for command dispatch, message routing, and exit lifecycle.
- [x] 8.3 Run targeted Webview tests for Embody Character header/input behavior.
- [x] 8.4 Run targeted Dashboard/entity tests for action delegation semantics.
- [x] 8.5 Run `@neko-agent/webview` build and relevant package compile checks.
- [x] 8.6 Run the Neko quality self-review gate and record any pre-existing unrelated failures.
