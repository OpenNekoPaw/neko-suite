## Validation

- `bun run build-neko.ts` from `packages/neko-agent/packages/cli-tui`: passed and rebuilt `packages/neko-agent/neko`.
- `./packages/neko-agent/neko --version` from repo root: passed, printed `0.0.1`.
- `./packages/neko-agent/neko config models` from repo root: passed and listed the configured `nekoapi-chat` models.
- `./packages/neko-agent/neko` from repo root in a PTY: passed startup smoke; the Ink TUI rendered the input box/status bar instead of failing with `TypeError: CGA.default is not a function`. Ctrl-C exited the session.
- The focused TUI component, reference, queue, timeline, artifact, command, hook, and adapter Vitest suite passed: 10 files / 56 tests. Live Agent behavior acceptance now runs as a focused `scripts/agent-eval` case through TUI debug automation rather than the removed package-local real API test config.
- `./node_modules/.bin/eslint packages/cli-tui/src/core/tui-command-router.ts packages/cli-tui/src/core/timeline-projector.ts packages/cli-tui/src/core/artifact-reference-formatter.ts packages/cli-tui/src/core/message-queue.ts packages/cli-tui/src/adapters/event-adapter.ts packages/cli-tui/src/components/Input/InputEditor.tsx packages/cli-tui/src/hooks/useSlashCommands.ts packages/cli-tui/src/hooks/useAgentSession.ts` from `packages/neko-agent`: passed.
- `git diff --check -- packages/neko-agent/packages/cli-tui/src/core/message-queue.ts packages/neko-agent/packages/cli-tui/src/hooks/useAgentSession.ts packages/neko-agent/packages/cli-tui/src/core/tui-command-router.ts packages/neko-agent/packages/cli-tui/src/core/timeline-projector.ts packages/neko-agent/packages/cli-tui/src/core/artifact-reference-formatter.ts packages/neko-agent/packages/cli-tui/src/adapters/event-adapter.ts packages/neko-agent/packages/cli-tui/src/components/Input/InputEditor.tsx packages/neko-agent/packages/cli-tui/src/hooks/useSlashCommands.ts openspec/changes/align-agent-tui-control-surface` from repo root: passed.
- `./node_modules/.bin/tsc --noEmit -p packages/cli-tui/tsconfig.json --pretty false | rg "timeline-projector|artifact-reference-formatter|event-adapter|conversation-store|MessageItem|types/state|real-api-tui-projection|InputEditor|slash-command-catalog|tui-command-router|component-snapshots|tui-feature-audit"` from `packages/neko-agent`: no matching touched-file diagnostics. The full TUI `tsc` still has unrelated pre-existing errors outside this change.
- `openspec validate align-agent-tui-control-surface --type change --strict` from repo root: passed.
- `pnpm check` from repo root: blocked before code checks by pnpm ignored build-script policy (`ERR_PNPM_IGNORED_BUILDS`). It requires `pnpm approve-builds` for dependencies such as `esbuild`, `sharp`, and `keytar`.

## Residual Risks

- `/artifact open` and `/artifact send` are port-backed only. Standalone TUI sessions without host implementations return visible diagnostics instead of attempting VS Code/Webview actions.
- TUI artifact references intentionally omit Webview URI, blob URL, temp absolute path, and runtime cache path values. If a tool emits only non-durable paths and no stable asset/resource id, the terminal row will show diagnostics with no reusable file identity.
- The terminal timeline projector consumes current Agent events and task/timeline messages, but standalone non-Ink runner output still uses its stream printer path unless it is wired to the same projector in a later follow-up.
