# Agent Eval Developer Scripts

These scripts are developer tooling for real Agent behavior acceptance through
`neko debug automation --stdio`. They do not implement Agent, Canvas, media,
Skill, EPUB, provider, or TUI business logic.

## Boundaries

- Target Agent turns are submitted through the debug automation protocol.
- Controller and judge model calls, when added by eval manifests, must use the
  configured external provider/API endpoints.
- Mock providers and eval-only fake business tools do not count as Agent
  behavior acceptance.
- Protocol parser, invalid request, stdio framing, and timeout classification
  tests may remain key-free.
- Controller or judge API unavailability is infrastructure fail.
- Bad controller prompts or bad target behavior are case fail.

## Test Case Design

Use [`test-cases.md`](./test-cases.md) as the source for eval case categories,
required evidence, manifest shape, and quality rubric. It covers single prompts,
message queues, closed-loop feedback, async/concurrent/iterative tasks, Skill
activation/triggering, and model/provider/profile binding.

## Exit Codes

- `0`: pass
- `1`: case fail
- `2`: infrastructure fail
- `3`: manifest/config invalid

## Protocol Smoke

Run a single prompt through the local developer automation protocol:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --cwd /Users/feng/Git/neko-test \
  --prompt "Generate a cat playing image and analyze the image content"
```

By default the script starts `./packages/neko-agent/neko debug automation --stdio`.
Override it with `NEKO_DEBUG_COMMAND` when testing an unbundled CLI:

```bash
NEKO_DEBUG_COMMAND="./node_modules/.bin/tsx packages/neko-agent/packages/cli-tui/src/cli.tsx" \
node scripts/agent-eval/protocol-smoke.mjs --cwd /tmp/neko-test --prompt "hello"
```

## Creative Workflow Scenarios

The initial creative workflow eval scenario manifest is:

```bash
scripts/agent-eval/scenarios/creative-workflows.scenarios.json
```

Dry-run a case to validate manifest parsing and environment interpolation without
starting Agent behavior acceptance:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json \
  --case cat-play-image-analysis \
  --dry-run
```

Run the cat image generation and analysis case through debug automation:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json \
  --case cat-play-image-analysis
```

The EPUB cases use `${A}` as the asset root. Export it before running:

```bash
export A=/Users/feng/Git/neko-test
```

Run the BLAME storyboard-to-Canvas case:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json \
  --case blame-epub-storyboard-to-canvas
```

Run the lamp-god animation planning case:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json \
  --case lamp-god-epub-animation-plan
```

For the Canvas case, follow the Agent run with `canvas-json-check.mjs` against
the Canvas JSON file created by the workflow.

## Canvas JSON Check

Use this as a deterministic existence/format/content check after an Agent run
that is expected to create a Canvas JSON file:

```bash
node scripts/agent-eval/canvas-json-check.mjs \
  --file /Users/feng/Git/neko-test/path/to/canvas.json \
  --expect storyboard \
  --expect nodes
```

This checks file existence, JSON parseability, and expected content in the JSON
string. It does not inspect Canvas Webview memory.
