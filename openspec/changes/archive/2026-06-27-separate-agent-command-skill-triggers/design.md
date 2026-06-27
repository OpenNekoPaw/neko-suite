## Context

Neko Agent currently has a single visible command trigger, `/`, that can represent several different actions:

- builtin Agent commands such as `/status`, `/model`, `/plan`, `/tools`, and `/mcp`;
- host or plugin slash commands registered by extensions;
- Skill-backed slash commands projected from Skill summaries;
- command-backed prompt artifacts that interpolate `$ARGUMENTS` and positional parameters.

The runtime already treats Skill activation differently from command execution. Activating a Skill injects prompt content, permission allow rules, tool guards, model overrides, and ToolSet activation through `SkillInjectionCoordinator`. Builtin commands and plugin commands usually control UI, session state, settings, or host effects. The UX currently groups these in the slash menu, but the input contract still makes users and routers decide what a `/token` really means.

The ADR `docs/architecture/adr-agent-command-skill-trigger-boundary.md` establishes the stable boundary:

```text
/command -> Agent, host, plugin, or command artifact control path
$skill   -> explicit Skill activation path
@ref     -> file/entity/asset/context reference path
text     -> normal prompt, with optional implicit Skill matching
```

## Goals / Non-Goals

**Goals:**

- Add `$<skill-name> [args]` as the canonical explicit Skill invocation entry for Webview and CLI/TUI.
- Keep `/` focused on builtin commands, host/UI commands, plugin slash commands, and explicitly-authored command artifacts.
- Keep Skill injection centralized in the existing runtime path.
- Provide shared, host-agnostic trigger/catalog contracts in `agent-types`.
- Make command/Skill conflicts and unknown entries fail visibly.
- Preserve `/skills` as a management command rather than a Skill invocation syntax.
- Provide migration diagnostics for legacy `/skill` aliases during prelaunch cleanup.

**Non-Goals:**

- Do not migrate plugin slash commands to `$`.
- Do not remove implicit Skill matching by natural language.
- Do not make Skill own workflow execution or host side effects.
- Do not let Webview import `@neko/agent`, `@neko/platform`, Extension modules, VS Code APIs, or Node APIs.
- Do not introduce remote command services, cloud-scale registries, or multi-tenant policy layers for this local VS Code client.

## Five-Layer Analysis

| Layer | Analysis |
| ----- | -------- |
| Responsibility | `agent-types` owns shared trigger DTOs and parser helpers. Webview/CLI own input menus and selection. Extension owns Webview message dispatch and host effects. `agent` owns Skill application through existing Skill services and coordinators. |
| Dependency | UI packages depend on `agent-types` contracts only. `agent`, `platform`, and `ai-sdk` remain host-agnostic. Extension may call runtime adapters, but runtime does not import VS Code or React. |
| Interface | Add typed trigger kinds and Skill invocation messages rather than overloading `invokeSlashCommand`. Keep `/` and `$` parsed into distinct request shapes. Existing Skill summaries may gain projection fields only if they are browser-safe. |
| Extension | Future entry types can be added by extending trigger metadata without changing Skill injection internals. Plugin slash commands remain independent of Skill invocation. |
| Testing | Unit tests cover parser/catalog projection. Runtime tests assert builtin commands do not hit Skill paths and `$skill` does. Webview tests cover menu/filter/keyboard behavior. VS Code Webview runtime smoke validates actual input routing. |

## Decisions

1. **Introduce trigger-aware catalog entries instead of reusing `SlashCommandCatalogItem` for everything.**

   The shared catalog should distinguish command entries from Skill invocation entries with explicit trigger metadata. Webview can still render both through common popover primitives, but the dispatch path must know whether the selected entry is `/` or `$`.

   Alternative rejected: continue putting Skills into `SlashCommandCatalogItem.source = "skill"` and only change the displayed prefix. That preserves the current mixed semantics and keeps runtime dispatch dependent on slash command routing.

2. **Canonical Skill invocation uses Skill identity, not the old `command` field.**

   `$<skill-name>` should target enabled Skill names. Command-backed prompt artifacts can continue to use explicit slash command metadata, but ordinary Skills should not need a `command` field to become user-invokable.

   Alternative rejected: map `$` only to Skills that already define `command`. That would preserve historical coupling and make most semantic Skills invisible to explicit invocation unless authors add redundant frontmatter.

3. **Route `$skill` through a new typed invocation path that ends in existing Skill injection.**

   The Webview should send a Skill invocation message or a trigger-typed command message. Extension then calls the same Skill application path used by existing explicit Skill activation. `SkillInjectionCoordinator` remains the single source of truth for Track A/B/C/D changes.

   Alternative rejected: let Webview directly call a Skill API or expand prompt text client-side. That would break Webview sandbox and duplicate runtime behavior.

4. **Keep `/skills` as management, not invocation.**

   `/skills` can list, inspect, clear, or open a Skill selector, but `$skill` is the direct invocation syntax. This preserves a clean difference between managing capabilities and applying a capability to the next turn.

   Alternative rejected: require `/skills use <name>` for direct invocation. That is explicit but cumbersome and still keeps user-facing Skill invocation under the command namespace.

5. **Treat legacy `/skill` aliases as migration-only.**

   During prelaunch migration, existing slash-backed Skill commands may remain temporarily if tests and diagnostics prove the canonical `$` path is not masked. New ordinary Skills should default to `$` only.

   Alternative rejected: keep both `/skill` and `$skill` forever. Dual canonical paths make help, autocomplete, telemetry, and conflict rules drift.

6. **Keep plugin slash commands in `/`.**

   Plugin commands are registered host actions, not necessarily Skill prompt injection. They should remain part of the command namespace and use explicit conversation context as they do today.

   Alternative rejected: put plugin commands under `$` because plugins may bundle Skills. Plugin packaging and Skill invocation are different concepts; a plugin may contribute tools, commands, UI, or Skills.

## Interface Sketch

The exact names can change during implementation, but the contract should express this shape:

```ts
type AgentInputTrigger = 'command' | 'skill' | 'mention';

interface AgentCommandCatalogEntry {
  trigger: 'command';
  prefix: '/';
  source: 'builtin' | 'plugin' | 'command-artifact';
  commandId: string;
  name: string;
}

interface AgentSkillInvocationEntry {
  trigger: 'skill';
  prefix: '$';
  skillName: string;
  description: string;
  enabled: boolean;
}

interface InvokeSkillWebviewMessage {
  type: 'invokeSkill';
  skillName: string;
  args?: string;
  conversationId: string;
}
```

The implementation should prefer one shared parser/helper package in `agent-types` over ad hoc string parsing in both Webview and CLI/TUI.

## Fail-Visible Behavior

- Unknown `/command` returns an unknown command diagnostic.
- Unknown `$skill` returns an unknown Skill diagnostic and does not send the text as a normal prompt.
- Disabled Skills return a disabled Skill diagnostic.
- If `/foo` and `$foo` both exist, `/foo` resolves only in the command namespace and `$foo` resolves only in the Skill namespace.
- A legacy `/skill` alias must either return an explicit migration diagnostic or be labeled as a temporary alias in tests and help.
- Missing Skill content, failed lazy load, invalid Skill manifest, unavailable required subpackage, or rejected tool references must surface as Skill activation failure, not no-op success.

## Migration Plan

1. Add shared trigger/catalog contracts and parser helpers.
2. Add `$` catalog projection and Webview popover support while keeping existing slash command behavior stable.
3. Add Extension/Webview typed Skill invocation dispatch and route it to existing Skill application.
4. Add CLI/TUI parity for `$` where current slash command support exists.
5. Update help/i18n and docs to teach `/`, `$`, and `@`.
6. Add legacy `/skill` alias diagnostics and remove ordinary Skill entries from default slash catalog.
7. Run focused tests and VS Code Webview runtime smoke.

Rollback during development is straightforward because the change is prelaunch and mostly input/protocol-facing: keep existing `/` command behavior, disable `$` menu projection, and leave Skill injection internals unchanged.

## Risks / Trade-offs

- **Menu complexity grows** -> Use shared popover primitives and trigger-specific catalogs rather than duplicating whole input components.
- **Legacy slash-backed Skills mask `$` tests** -> Add poisoned legacy-path tests or counters proving `$` dispatch hit the canonical Skill invocation route.
- **Command-backed prompt artifacts become confusing** -> Label them as command artifacts and keep them under `/`; ordinary Skills use `$`.
- **CLI/TUI and Webview drift** -> Move parsing and catalog normalization into `agent-types`, then write shared contract tests.
- **Users type `$` in normal prose** -> Only open/parse `$` invocation at token boundaries and when the token matches the Skill invocation grammar.

## Open Questions

- Should legacy `/skill` aliases be hidden immediately after `$` lands, or shown with a deprecation badge for one prelaunch iteration?
- Should `$` invocation allow quoted names for Skills whose display names differ from canonical ids, or should only canonical `name` be accepted?
- Should the first `$skill args` turn automatically send `args` as the next user prompt, or only activate the Skill and leave arguments to the injected prompt placeholders? Existing slash-backed Skill behavior can guide the implementation.
