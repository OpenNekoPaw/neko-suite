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

The guard reports known soft-boundary compatibility points in its JSON output under
`compatibilityExceptions`. Every exception is a lifecycle record, not an open-ended
allowlist entry.

Each record must include:

- `id`: stable exception id.
- `file`: repository-relative file path.
- `reason`: why the compatibility point still exists.
- `owner`: team or package owner responsible for removing or renewing it.
- `tracking`: OpenSpec task, issue, or ADR reference.
- `introducedAt`: first date the exception was accepted.
- `expiresAt` or `sunsetMilestone`: absolute expiry date, migration milestone, or both.
- `replacement`: runtime-native or host-adapter path that should replace it.
- `severityAfterExpiry`: `failure` or `warning`.

The guard also emits `compatibilityFindings` for missing metadata, duplicate ids,
invalid expiry dates, missing renewal rationale, and expired exceptions. Expired
exceptions with `severityAfterExpiry: "failure"` fail `pnpm check:agent-boundaries`.
Expired warning-severity exceptions stay visible in JSON output but do not block the
guard.

Renewal is intentionally auditable. If an exception's expiry moves forward, the
record must keep `previousExpiresAt` and add `renewalRationale`, or the guard
self-test pattern will fail when copied into production metadata.

Current exception groups:

| Id | File | Owner | Expiry | Replacement |
| --- | --- | --- | --- | --- |
| `agent-turn-bridge-host-adapter` | `packages/neko-agent/packages/extension/src/chat/message/agentTurnBridge.ts` | `neko-agent-runtime` | `2026-06-04` | `AgentTurnHostAdapters + runAgentTurnForWebviewRuntime` |
| `agent-runner-vscode-event-compat` | `packages/neko-agent/packages/extension/src/ai/agentRunner.ts` | `neko-agent-runtime` | `2026-06-04` | `AgentRunnerPort + onDidRunnerEvent bridge` |
| `skill-file-service-watcher-adapter` | `packages/neko-agent/packages/extension/src/services/SkillFileService.ts` | `neko-agent-platform` | `2026-07-04` | `skill-file-runtime watch plan + Extension watcher executor` |
| `agent-core-command-bridge` | `packages/neko-agent/packages/extension/src/commands/agentCoreCommands.ts` | `neko-agent-extension` | `2026-07-04` | `runtime command registry projection + Extension command adapter` |
| `quality-check-tool-bridge` | `packages/neko-agent/packages/extension/src/tools/qualityCheckTools.ts` | `neko-agent-tools` | `2026-06-18` | `AgentMultimodalHostAdapter payload loader + runtime validation tools` |
| `consistency-check-tool-bridge` | `packages/neko-agent/packages/extension/src/tools/consistencyCheckTools.ts` | `neko-agent-tools` | `2026-06-18` | `AgentMultimodalHostAdapter payload loader + runtime validation tools` |
| `puppet-face-tool-bridge` | `packages/neko-agent/packages/extension/src/tools/puppetFaceTools.ts` | `neko-agent-tools` | `2026-07-04` | `tool modality declaration + Extension host adapter` |

These exceptions are current migration points. They should shrink as
`harden-neko-agent-runtime-workflow-closure` closes runner adapter, multimodal
feedback, command projection, and tool host-adapter work.
