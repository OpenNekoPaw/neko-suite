# neko-agent Runtime Boundary Guard

**Status**: Implemented baseline guard  
**Date**: 2026-05-04  
**Scope**: `packages/neko-agent`

## Purpose

This guard protects the current `neko-agent` package boundary while the runtime workflow boundary work is applied:

- Webview owns UI rendering, user interaction, Webview message sending, and runtime state projection.
- Extension owns VSCode commands, workspace/file/URI access, Webview `postMessage`, Extension API access, and host adapter wiring.
- Agent runtime owns turn assembly, IDC/workflow behavior, prompt/schema generation, skill/capability injection policy, task/subagent orchestration, and evaluator/runtime policy.
- Platform and AI SDK remain host-agnostic provider/tool/model adapters.

## Command

Run:

```bash
pnpm check:agent-boundaries
```

For guard self-tests:

```bash
node scripts/check-neko-agent-boundaries.mjs --self-test
```

## Hard Rules

The guard fails on these import-level regressions:

- `webview` importing `vscode`, `@neko/agent`, `@neko/platform`, `@neko/ai-sdk`, or Extension implementation APIs.
- `extension` importing React/ReactDOM or Webview implementation APIs.
- `agent`, `platform`, `ai-sdk`, or `agent-types` importing VSCode, React/ReactDOM, Webview implementation APIs, or Extension implementation APIs.

`@neko/shared/vscode` is allowed in Webview for the shared `acquireVsCodeApi` wrapper, but not in host-agnostic packages.

## Compatibility Exceptions

The guard reports these known soft-boundary compatibility points in its JSON output:

- `packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts`: P1 compatibility bridge while turn assembly migrates to runtime.
- `packages/neko-agent/packages/extension/src/ai/agentRunner.ts`: P1 compatibility adapter while `AgentRunnerPort` replaces VSCode event-shaped contracts.
- `packages/neko-agent/packages/extension/src/services/SkillFileService.ts`: P2 watcher adapter; Extension owns VSCode file watchers while runtime owns skill file rules.
- `packages/neko-agent/packages/extension/src/commands/agentCoreCommands.ts`: command bridge; Extension owns VSCode command registration and input collection.
- `packages/neko-agent/packages/extension/src/tools/qualityCheckTools.ts`: tool bridge; Extension supplies VSCode file access.
- `packages/neko-agent/packages/extension/src/tools/consistencyCheckTools.ts`: tool bridge; Extension supplies logger/dependency adapters.
- `packages/neko-agent/packages/extension/src/tools/puppetFaceTools.ts`: tool bridge; Extension supplies VSCode command and cross-extension API access.

These exceptions are not hard failures because they are current migration points. They should shrink as `unify-neko-agent-runtime-workflow-boundaries` tasks 2, 3, and 8 land.
