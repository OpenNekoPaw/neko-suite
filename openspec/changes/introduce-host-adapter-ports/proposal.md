## Why

Neko needs a stable way to run the same non-graphical domain capabilities in VSCode, TUI, and future standalone clients without letting Agent, Webview, or domain packages depend on concrete VSCode, Node, or native APIs. Current TUI failures around `ReadDocument`/`ReadImage`, asset awareness, `.neko` visibility, and skill activation show that the host boundary is implicit and VSCode-shaped instead of being an explicit local-client contract.

## What Changes

- Introduce a dedicated `@neko/host` package for Host Adapter port contracts only.
- Define host primitive contracts for environment, workspace, filesystem, path, secrets, external opening, diagnostics, and access policy.
- Keep Host Adapter concrete implementations outside `@neko/host`, initially in VSCode extension composition roots and TUI Node composition roots.
- Treat `workspace/.neko` as client-owned domain data: TUI/client code may read/write it through owning domain runtimes, while Agent tools may only consume sanitized projections or mutation proposals.
- Make TUI a headless full client for non-graphical capabilities: content, assets, entity, search, config, cache-aware projections, auth/market, and Engine headless operations should be registered through capability providers rather than Webview/VSCode-only code paths.
- Move document/image read capability ownership toward the content domain boundary so VSCode and TUI can both register `ReadDocument`/`ReadImage` without importing extension internals or inflating `@neko/agent`.
- Fix the TUI skill lifecycle provider contract so `ActivateSkill` receives `{ name, reason }` instead of a legacy string parameter.

## Capabilities

### New Capabilities

- `host-adapter-ports`: Defines host primitive contracts, adapter ownership rules, `.neko` access policy, and client composition requirements for VSCode, TUI, and future standalone clients.

### Modified Capabilities

- `cross-domain-content-access-runtime`: Content access and document/image reading must be composable through host ports so non-VSCode clients can use the same source/ref/cache-hidden behavior without Webview URI dependencies.
- `agent-content-access-cache`: Agent-facing content tools must remain host-neutral, must not expose or mutate `.neko` internals, and must register in TUI through domain capability providers rather than extension-only factories.
- `agent-command-skill-trigger-boundary`: TUI and other clients must honor the structured `ActivateSkill` provider contract so Agent-driven skill activation cannot pass object payloads into legacy string-only lifecycle paths.

## Impact

- New package: `packages/neko-host`.
- TUI affected areas: `packages/neko-agent/packages/cli-tui/src/core`, `src/hooks`, future `src/host`, capability loading, and tool registration.
- Agent affected areas: skill lifecycle session provider, Agent content tool registration, generic file tool access policy for `.neko`.
- Content affected areas: document runtime/capability provider ownership for `ReadDocument` and `ReadImage`.
- Extension affected areas: VSCode host adapter composition and existing content capability providers; behavior should remain compatible but move toward shared host contracts.
- Documentation and validation affected areas: architecture boundary docs, OpenSpec specs, package boundary tests, TUI tool registration tests, content access tests, and Agent `.neko` isolation tests.
