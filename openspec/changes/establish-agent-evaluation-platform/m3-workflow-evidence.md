# M3 Workflow Controller Evidence

Date: 2026-07-13

## Harness Evidence

- `pnpm test:agent:eval`
  - 14 files passed.
  - 137 tests passed before the final M3 suite additions; subsequent focused controller, hard-gate, structured-output, and discovery tests also passed.
- All discovered v2 cases completed key-free dry-run validation.
  - 6 suites.
  - 11 cases.
- Controller tests prove that submit, queue, and feedback inputs use `message.submit`; cancellation uses `message.cancel`; resume uses `session.resume`; timeout, evidence failure, and cleanup failure dispose the active session; and the v2 runner has no single-message or direct Agent runner fallback.

## Real Queue Workflow

Case: `agent-runtime.workflow-controller/queue-during-run`

Bundled TUI command:

```text
node scripts/agent-eval/protocol-smoke.mjs --suite agent-runtime.workflow-controller --case queue-during-run --run-id run-m3-queue-real-bundled-v2
```

Result: `configuration-invalid`

- Actual model: `nekoapi-chat/gpt-5.5`.
- The first follow-up returned `queued=true`, proving that the external controller used the bundled TUI queue path.
- The bundled executable does not expose the current effective configuration or evidence-completeness contract.
- Its final queue snapshot still reported one pending item, so queue drain cannot be accepted from this binary.
- Raw report: `reports/agent-eval/agent-runtime.workflow-controller/queue-during-run/run-m3-queue-real-bundled-v2/`.

Current-source TUI command:

```text
NEKO_DEBUG_COMMAND='./node_modules/.bin/tsx packages/neko-agent/packages/cli-tui/src/cli.tsx' node scripts/agent-eval/protocol-smoke.mjs --suite agent-runtime.workflow-controller --case queue-during-run --run-id run-m3-queue-real-source
```

Result: `infrastructure-fail`

- Node/tsx could not import the named `createNekoAssetsHeadlessCapabilityProvider` export from `neko-assets/agent-headless` because that extension package is interpreted through an incompatible ESM/CJS boundary.
- No TUI session was created and no model call ran.
- Raw report: `reports/agent-eval/agent-runtime.workflow-controller/queue-during-run/run-m3-queue-real-source/`.

## Real Cancellation Workflow

Case: `agent-runtime.stream-delivery/active-stream-cancellation`

Bundled TUI command:

```text
node scripts/agent-eval/protocol-smoke.mjs --suite agent-runtime.stream-delivery --case active-stream-cancellation --run-id run-m3-cancel-real-bundled
```

Result: `configuration-invalid`

- Actual model: `nekoapi-chat/gpt-5.5`.
- `message.cancel` returned `accepted=true` and the bundled TUI reported terminal idle concerns.
- The provider stream later returned HTTP 524. The bundled executable still lacks current configuration and evidence-completeness facts, so the run cannot be accepted even though cancellation control evidence was observed.
- Raw report: `reports/agent-eval/agent-runtime.stream-delivery/active-stream-cancellation/run-m3-cancel-real-bundled/`.

Current-source TUI command:

```text
NEKO_DEBUG_COMMAND='./node_modules/.bin/tsx packages/neko-agent/packages/cli-tui/src/cli.tsx' node scripts/agent-eval/protocol-smoke.mjs --suite agent-runtime.stream-delivery --case active-stream-cancellation --run-id run-m3-cancel-real-source
```

Result: `infrastructure-fail`

- Blocked by the same `neko-assets/agent-headless` ESM/CJS named-export boundary before TUI session creation.
- Raw report: `reports/agent-eval/agent-runtime.stream-delivery/active-stream-cancellation/run-m3-cancel-real-source/`.

## Residual Risk

- No M3 real case passed against a current-source or current-contract TUI executable.
- The old bundle provides partial queue/cancellation control evidence only; it is not behavior acceptance.
- Fixing or repackaging the `neko-assets` module boundary is outside this change and remains the blocker for current-source real Evaluation.
- The cancellation provider returned HTTP 524, so cancellation behavior under a healthy long-lived stream remains unverified.
