## Built-in Debug Webview Functional Evidence

Date: 2026-07-13 (Asia/Hong_Kong)

### Accepted Host Boundary

The accepted local host is the existing VS Code built-in `Debug Dev (All)`
`extensionHost` configuration. It opens `/Users/feng/Git/neko-test`, loads the
repository controller and development extensions through direct development
paths, and shares the developer VS Code CDP endpoint on port `9222`. The
repository runner only attaches to that session; it does not launch `code`,
download `.vscode-test`, own the VS Code process, or close the Debug Host.

The accepted runs below reported VS Code `1.128.0`, controller PID `2365`,
workspace `/Users/feng/Git/neko-test`, and isolated fixtures below
`.neko/.functional/`.

### Commands

```bash
pnpm test:webview:functional --scenario scripts/webview-functional/scenarios/agent/agent-view-submit.p0.scenario.json --debug-port 9222 --startup-timeout-ms 30000
pnpm test:webview:functional --scenario scripts/webview-functional/scenarios/canvas/canvas-edit-save-reopen.p0.scenario.json --debug-port 9222 --startup-timeout-ms 30000
pnpm test:webview:functional --scenario scripts/webview-functional/scenarios/story/story-edit-diagnostic-save-reopen.p0.scenario.json --debug-port 9222 --startup-timeout-ms 30000
node "$CODEX_HOME/skills/vscode-extension-debugger/scripts/cdp-client.js" --port 9222 preflight
node "$CODEX_HOME/skills/vscode-extension-debugger/scripts/cdp-client.js" --port 9222 list
node "$CODEX_HOME/skills/vscode-extension-debugger/scripts/cdp-client.js" --port 9222 snapshot 45A8737FC6970AE24220193A11554B5D
node "$CODEX_HOME/skills/vscode-extension-debugger/scripts/cdp-client.js" --port 9222 console 45A8737FC6970AE24220193A11554B5D
node "$CODEX_HOME/skills/vscode-extension-debugger/scripts/cdp-client.js" --port 9222 screenshot E1C4AFFE01D59F41C39374ABCCC975B3 reports/webview-functional/agent-debug-dev-all.png
```

The Agent, Canvas, and Story scenarios passed through the same built-in Debug
Host. Independent `vscode-extension-debugger` preflight found the Debug Host
page and the real `neko.neko-agent` iframe on port `9222`; its snapshot showed
the loaded Agent UI, submitted message, and usable composer. The short console
window contained only the allowlisted VS Code `local-network-access` warning.

### Reports

- Agent submit/hide/reveal: `reports/webview-functional/agent.view-submit.p0/2026-07-13T01-34-17-170Z/result.json`
- Canvas edit/save/reopen: `reports/webview-functional/canvas.edit-save-reopen.p0/2026-07-13T01-36-28-968Z/result.json`
- Story edit/diagnostic/save/reopen: `reports/webview-functional/story.edit-diagnostic-save-reopen.p0/2026-07-13T01-26-21-889Z/result.json`
- Agent debugger screenshot: `reports/webview-functional/agent-debug-dev-all.png`
- Story debugger screenshot: `reports/webview-functional/story-debug-dev-all.png`

Each report directory contains the versioned result, steps, assertions, runtime errors, host logs, DOM snapshot, VS Code screenshot, and side-effect manifest. Raw evidence remains under gitignored `reports/`.

### Path Evidence

- Agent submit uses the real View iframe, user input and CDP mouse click,
  Extension-owned conversation binding, host/session message projection, and
  hide/reveal followed by continued input. VS Code preserves the same iframe
  target across panel hide/reveal, so the runner reuses that target instead of
  incorrectly requiring realm replacement.
- Canvas edit uses the real Custom Editor, editable focus suppression, visible node selection, Webview keyboard dispatcher, Canvas dirty state, VS Code custom-document save, close/reopen, and durable `project.nkc` content.
- Story opens the real Preview, navigates from preview to source, edits and
  saves through the public host boundary, observes preview refresh, verifies
  `story.syntax.unclosed-note`, and proves source plus diagnostic durability
  after close/reopen.
- Runtime error assertions passed with no unexpected Webview, CSP, resource, console, or Extension Host failures.

### Agent Tab State Regression

The reported `Unsupported Agent Tab render realm state schema` failure came
from the retired schema-less `{ agentTurnTimelineRecoveries: [...] }` Webview
state. The v1 Tab realm parser now recognizes only that exact retired shape,
rewrites it immediately as `neko.agent.tab-render-realm-state.v1`, and continues
to fail visibly for arbitrary schema-less or unknown state. The accepted Agent
run loaded a Webview whose bootstrap still contained the retired state payload,
then rendered and accepted input without the schema exception. Focused tests
cover both the migration and the unknown-state rejection.

The debugger screenshot also contains a visible
`conversation-durability-failed` alert from an earlier real provider `524`.
That provider/durability failure is not the Tab schema failure and is not
treated as resolved by this evidence. The current Agent P0 proves UI/host
submission and lifecycle projection, but it does not wait for external model
completion; provider terminal-state coverage remains a separate Agent scenario
gap.

### Superseded Evidence

Reports dated before the attach-only migration used runner-owned VS Code
instances on random `50xxx` CDP ports and did not report the fixed
`/Users/feng/Git/neko-test` workspace. They remain useful implementation
diagnostics but are explicitly non-acceptance evidence. They do not close any
built-in Debug requirement.

### Evidence Handling

An attempted screenshot of a non-isolated developer window was deleted immediately because it contained local configuration content. Only screenshots from isolated fixture workspaces are retained as acceptance evidence.

### Residual Risk

- These accepted reports were produced on macOS arm64. Linux/Xvfb cannot yet
  start the VS Code built-in Debug configuration through an authorized runner;
  CI rollout tasks 8.2 and 8.3 remain blocked.
- The direct development-path solution is proven for Canvas plus Engine, Tools, and Preview, and for the Agent dependency set. A measured comparison with prebuilt dependency VSIX installation remains open under task 1.4.
- Remaining package Webviews, Engine unavailable cases, and long-lifecycle/cross-plugin scenarios remain open in sections 6-8.

## Coverage Baseline Evidence

Date: 2026-07-13 (Asia/Hong_Kong)

### Canonical Run

```bash
pnpm test:coverage
node scripts/test-orchestration/collect-coverage-baseline.mjs --output quality/coverage-baseline.json
```

`pnpm test:coverage` scheduled all 46 canonical owners with Turbo `--continue=always`. It returned exit code 1: 25 owners completed successfully and 21 owners failed because of existing/parallel test failures, no-test ownership defects, or newly enforced all-source thresholds. The nonzero result is retained as a visible quality failure and is not described as a passing gate.

Every owner that did not leave a summary during the full run was then executed with one existing package-owned focused test while preserving the same complete production `coverage.include`. Those focused runs intentionally continued to fail thresholds where the conservative numerator was below baseline; they were used only to materialize the all-source denominator and zero-coverage ledger, not as a replacement for the canonical run.

The committed `quality/coverage-baseline.json` records:

- 46 canonical owners.
- 24 owners below at least one default threshold.
- 1532 production files with zero covered lines.
- A per-owner closing condition requiring package-owned tests and higher thresholds without reducing coverage includes.

### Never-imported Source Proof

The canonical run reported `packages/neko-live/packages/webview/src/App.tsx` at 0% statements, branches, functions, and lines. The machine baseline retains it in `packages/neko-live/packages/webview.zeroCoveredSourceFiles`; therefore an unimported production file remains in the denominator instead of disappearing from the report.

### Coverage Residual Risk

- The all-source migration has deliberately exposed large real gaps; the baseline is a debt ledger, not evidence that repository coverage currently passes.
- Agent, Canvas, Cut, Engine, Skills, and other owners still have independent failing tests or thresholds. Those failures require owning-package fixes and are not relaxed by this testing-infrastructure change.

## Desktop Engine and Host-private Evidence

Date: 2026-07-13 (Asia/Hong_Kong)

```bash
pnpm test:webview:functional --scenario scripts/webview-functional/scenarios/desktop/engine-unavailable.p0.scenario.json
pnpm test:webview:functional --scenario scripts/webview-functional/scenarios/desktop/engine-ready-host-private.p2.scenario.json
```

Both scenarios passed in the real Electron Desktop AppHost on macOS arm64.

- Engine unavailable: the prerequisite reserved an isolated unbound Engine port; Desktop probed that real boundary, projected `engine:unavailable`, and returned the visible typed `engine-unavailable` reason after the user opened Inspector and activated the viewport.
- Engine ready: the prerequisite built and started `packages/neko-engine/target/debug/neko-engine`, waited for its real HTTP health boundary, injected only the isolated port into Desktop, and observed `engine:ready`. The same public viewport action then returned the visible typed `viewport-intent-unimplemented` host-private diagnostic instead of a no-op or simulated success.
- The prerequisite runtime retained Engine observations and logs in the shared report, and terminated both Engine and Electron processes after the scenario.
- Both reports contain passing structured steps/assertions, DOM, screenshot, logs, and zero unexpected runtime errors.

Reports:

- `reports/webview-functional/desktop.engine-unavailable.p0/2026-07-12T23-42-39-206Z/result.json`
- `reports/webview-functional/desktop.engine-ready-host-private.p2/2026-07-12T23-43-21-514Z/result.json`

## Nightly and Release Workflow Blocker

```bash
node --test scripts/test-orchestration/ui-functional-workflow.test.mjs scripts/webview-functional/scenario-selection.test.mjs
```

The guard tests prove GitHub workflows do not invoke
`pnpm test:webview:functional`, download VS Code, or reintroduce the retired
`NEKO_VSCODE_COMMAND` direct-launch path. The previous
`.github/workflows/ui-functional.yml` and release functional job were removed
because GitHub-hosted runners cannot drive the required built-in Debug
configuration. Tasks 8.2 and 8.3 remain blocked until an authorized runner can
start `Debug Dev (All)` with `../neko-test`; target/build smoke is not used as a
fallback success.

## Cut P0 Functional Evidence

Date: 2026-07-13 (Asia/Hong_Kong)

```bash
pnpm test:webview:functional --scenario scripts/webview-functional/scenarios/cut/cut-add-track-save-reopen.p0.scenario.json
pnpm test:webview:functional --scenario scripts/webview-functional/scenarios/cut/cut-engine-unavailable-authoring.p0.scenario.json
```

Both scenarios passed in the real VS Code `1.128.0` Extension Development Host on macOS arm64 with isolated workspace, user data, extensions, and the real Cut, Engine, Tools, and Preview development extensions.

- Engine ready: opened the real `.nkv` Custom Editor, added an Audio track through the visible timeline control, saved, closed/reopened, verified `tracks.1.type === "audio"`, and observed public `neko.engine.getStatus.state === "ready"` with zero unexpected runtime errors.
- Engine unavailable: stopped the real Engine through its public command, observed `state === "idle"`, added a Text track through the visible UI, projected `cut.engine.stream-unavailable`, saved `tracks.1.type === "text"`, and retained the eight source-matched stream failures as versioned `cut-engine-stream-unavailable.v1` expected evidence. Unknown runtime failures remained zero.
- Cut activation now uses the shared optional Agent capability registration boundary. An absent Agent extension does not execute a missing command; an installed Agent registration failure remains fail-visible.

Reports:

- `reports/webview-functional/cut.add-track-save-reopen.p0/2026-07-13T00-13-17-478Z/result.json`
- `reports/webview-functional/cut.engine-unavailable-authoring.p0/2026-07-13T00-12-35-386Z/result.json`

## Interim Quality Review

Date: 2026-07-13 (Asia/Hong_Kong)

Risk classification: L4 for repository test/release orchestration and real-host
functional acceptance; the focused Agent Tab persisted-state migration is L2.

Passed:

- `node --test scripts/webview-functional/*.test.mjs`: 55/55.
- `pnpm --dir packages/neko-agent/packages/webview exec vitest run src/render-runtime/__tests__/tab-render-realm-state.test.ts`: 6/6.
- `pnpm --filter neko-agent compile:webview`.
- `node scripts/check-legacy-debt-surfaces.mjs --self-test`: 12/12.
- `openspec validate establish-vscode-webview-functional-testing --strict`.
- `git diff --check`.
- Real built-in Debug Agent, Canvas, and Story P0 reports listed above.
- Independent `vscode-extension-debugger` preflight, Agent DOM snapshot,
  short console capture, and VS Code page screenshot on shared port `9222`.

Repository-wide gates still failing:

- `pnpm check:unused` now reports no Webview functional runner/controller issue,
  but still fails on 5 unused dependencies, 5 unlisted dependencies, 26 unused
  exports, 2 duplicate exports, and existing Knip configuration hints in
  parallel Agent/Desktop/package changes.
- `pnpm check:legacy-debt` excludes the gitignored `.vscode-test` download
  cache and passes its 12-case scanner self-test, but still fails on 85
  blocking production debt occurrences outside this focused fix.
- `pnpm check` stops at the same `check:unused` failures before dependency
  cruise. `pnpm ci:local` is therefore not claimed as passing, and task 8.7
  remains open.

Review findings resolved in this session:

- The retired Agent state migration now validates the exact five-field
  descriptor shape, non-empty identities, and positive integer revision;
  malformed schema-less lookalikes remain fail-visible.
- VS Code panel hide/reveal may preserve the iframe target. The attach host now
  reuses that target, while Custom Editor close/reopen still requires a new
  target. A regression test went red on the previous assumption and now passes.
- Knip now recognizes the externally loaded VS Code controller and the
  package-scoped Electron resolution, and runner-only symbols no longer expose
  unused public exports.

Residual risk:

- Agent P0 does not wait for provider terminal state. The visible prior
  `conversation-durability-failed` / provider `524` remains a separate gap and
  prevents treating UI submission evidence as provider/durability acceptance.
- Linux/Xvfb and GitHub built-in Debug automation remain blocked until an
  authorized runner exists; tasks 8.2 and 8.3 stay open.
- Audio, Model, Sketch, Puppet, Preview, Dashboard, Assets, Market, Live, Tools,
  cross-plugin, media/Engine, and long-lifecycle scenarios remain unexecuted or
  unimplemented under tasks 6.3-6.8.
