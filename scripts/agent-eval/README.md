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

Use [`.codex/skills/neko-agent-evaluation/SKILL.md`](../../.codex/skills/neko-agent-evaluation/SKILL.md)
to decide whether a change requires evaluation and to define canonical-path,
forbidden-fallback, observability, and residual-risk evidence.

## Development Gate

Run the key-free harness tests after changing this directory, scenario
manifests, the debug automation protocol, or exported fact contracts:

```bash
pnpm test:agent:eval
```

This command runs in `pnpm ci:local` and GitHub CI. It validates harness and
protocol behavior; it does not replace a real TUI Agent case. Only assertions
with evaluators actually executed by the current runner count as passed.
Metadata printed by `--dry-run`, a zero exit code, or a non-empty final answer
must not be reported as complete scenario acceptance on their own.

## Executable Scenario Evidence

`protocol-smoke.mjs` validates the selected case before spawning the TUI. Unknown
case kinds, assertion kinds, setup operations, and post-check kinds are
configuration errors rather than ignored metadata.

The script-owned scenario runtime currently supports:

- contained workspace fixtures: `remove-path`, `write-file`;
- runtime/final-answer/task/continuation/Skill/tool-call assertions;
- deterministic structured `tool-call-succeeded` and `tool-call-failed`
  matching against `turns[].toolCalls[]`;
- contained `file-exists` and `file-absent` checks plus `canvas-json` checks.

Fixture writes and removals are restricted to relative paths below the selected
`cwd`, reject traversal and symlink crossings, and should still be run only in a
dedicated evaluation workspace. Successful output includes separate `setup`,
`evaluation.assertions`, `evaluation.postChecks`, and raw `facts` evidence.

## Exit Codes

- `0`: runner-supported checks passed
- `1`: case fail
- `2`: infrastructure fail
- `3`: manifest/config invalid

## Protocol Smoke

Run a single prompt through the local developer automation protocol:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --cwd "$HOME/Git/neko-test" \
  --prompt "Generate a cat playing image and analyze the image content"
```

By default the script starts `./packages/neko-agent/neko debug automation --stdio`.
Override it with `NEKO_DEBUG_COMMAND` when testing an unbundled CLI:

```bash
NEKO_DEBUG_COMMAND="./node_modules/.bin/tsx packages/neko-agent/packages/cli-tui/src/cli.tsx" \
node scripts/agent-eval/protocol-smoke.mjs --cwd /tmp/neko-test --prompt "hello"
```

## Portable Skill Creation Scenarios

Native portable Skill creation acceptance cases are defined in:

```bash
scripts/agent-eval/scenarios/portable-skill-creation.scenarios.json
```

They cover canonical project creation, invalid Skill rejection, resource-path
traversal rejection, existing-target conflict, `.agents/skills` path evidence,
absence of a canonical root `manifest.json`, and unchanged poisoned
`.neko/skills` input. The manifest uses a dedicated temporary workspace at
`/tmp/neko-agent-portable-skill-eval`.

Validate any case without starting a provider-backed Agent:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/portable-skill-creation.scenarios.json \
  --case native-create-project-skill \
  --dry-run
```

Run the real focused case through TUI debug automation by removing `--dry-run`.
Provider credentials and an available chat model are required for real Agent
behavior acceptance.

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

Run the cat image generation, image analysis, and conditional regeneration case through debug automation:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json \
  --case cat-play-image-analysis
```

The EPUB cases use `${A}` as the asset root. Export it before running:

```bash
export A="$HOME/Git/neko-test"
```

Run the BLAME storyboard-to-Canvas case:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/creative-workflows.scenarios.json \
  --case blame-epub-storyboard-to-canvas
```

This case validates EPUB image analysis, storyboard table generation, and a
Canvas handoff. After the Agent run, run `canvas-json-check.mjs` against the
Canvas JSON file generated in `$HOME/Git/neko-test`.

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
  --file "$HOME/Git/neko-test/path/to/canvas.json" \
  --expect storyboard \
  --expect nodes
```

This checks file existence, JSON parseability, and expected content in the JSON
string. It does not inspect Canvas Webview memory.

## TUI Markdown Rendering Scenarios

Focused normalized Markdown/TUI cases are defined in:

```bash
scripts/agent-eval/scenarios/tui-markdown-rendering.scenarios.json
```

They cover mixed CommonMark/GFM, aligned and ragged tables, escaped pipes, multiline code, CJK/emoji/combining text, incomplete table/fence streaming, terminal resize, and provider-authored ESC/CSI/OSC/BEL/C0/C1 payloads.

The TUI debug automation contract exposes generally useful Markdown path facts under `session.facts.markdown`:

- `pathEvents`: bounded canonical-path events such as `session-created`, `source-updated`, `document-projected`, `layout-created` and `session-finalized`;
- `droppedPathEventCount`: overflow evidence; runner assertions fail when facts are incomplete.

`terminal.resize` is a general automation control with integer `columns`/`rows` in `1..1000`; it updates the TUI terminal-size store for the selected debug session. Scenario manifests may declare ordered `terminalResizes` after Agent idle.

`markdown-path-events` is runner-owned assertion semantics, not an eval-specific runtime pass/fail field. It can require events for the same Markdown key, require observed viewport widths, and prove those widths reflow the same document revision.

Validate the manifest/case and protocol without a provider:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/tui-markdown-rendering.scenarios.json \
  --case mixed-gfm-unicode-resize \
  --dry-run
```

Run the real focused Agent/provider case by removing `--dry-run`:

```bash
node scripts/agent-eval/protocol-smoke.mjs \
  --manifest scripts/agent-eval/scenarios/tui-markdown-rendering.scenarios.json \
  --case mixed-gfm-unicode-resize
```

`pnpm test:agent:eval` and dry-run validation are key-free harness evidence only. They must not be reported as provider/model behavior acceptance. A real case requires available provider/model credentials and network/controller access; blockers and residual risk must be recorded explicitly.
