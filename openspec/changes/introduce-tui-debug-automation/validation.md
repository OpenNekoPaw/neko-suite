## Validation

- `./node_modules/.bin/vitest --run packages/neko-agent/packages/cli-tui/src/__tests__/cli-program.test.ts packages/neko-agent/packages/cli-tui/src/__tests__/cli-program-action.test.ts packages/neko-agent/packages/cli-tui/src/core/debug-automation/__tests__/protocol.test.ts packages/neko-agent/packages/cli-tui/src/core/debug-automation/__tests__/stdio.test.ts packages/neko-agent/packages/cli-tui/src/core/debug-automation/__tests__/session-manager.test.tsx packages/neko-agent/packages/cli-tui/src/core/debug-automation/__tests__/boundary.test.ts`: passed, 6 files / 15 tests.
- `./node_modules/.bin/tsc --noEmit -p packages/neko-agent/packages/cli-tui/tsconfig.json --pretty false 2>&1 | rg "debug-automation|components/App|src/cli.tsx|cli-program-action|cli-program.test"`: only matched the pre-existing `poison-paths.ts` test-utils rootDir diagnostic from `cli-program-action.test.ts`; no debug automation implementation diagnostics matched.
- `node scripts/agent-eval/canvas-json-check.mjs --file <temp-canvas-json> --expect storyboard --expect nodes`: passed.
- `node scripts/agent-eval/protocol-smoke.mjs --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json --case cat-play-image-analysis --dry-run`: passed.
- `A=/Users/feng/Git/neko-test node scripts/agent-eval/protocol-smoke.mjs --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json --case blame-epub-storyboard-to-canvas --dry-run`: passed.
- `A=/Users/feng/Git/neko-test node scripts/agent-eval/protocol-smoke.mjs --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json --case lamp-god-epub-animation-plan --dry-run`: passed.

## Residual Risk

- No real API Agent behavior acceptance run was executed in this implementation pass. Target/controller/judge provider credentials, network availability, quota, model access, and local creative fixtures were not exercised.
- The implemented protocol and session manager tests are key-free and validate command wiring, protocol parsing, stdio framing, fail-visible invalid input, complete TUI App/session owner binding, canonical resume rejection, and absence of old headless/eval assembly in debug automation modules.
- A follow-up real API run through `scripts/agent-eval/protocol-smoke.mjs` is still required before claiming Agent behavior acceptance evidence for a model, Skill, media, or Canvas workflow.
