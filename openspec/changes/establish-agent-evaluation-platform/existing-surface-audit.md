## Existing Surface Audit

Audit date: 2026-07-13

This is a change-local implementation input for tasks 1.1 and 1.2. Executable code is
authoritative; this snapshot is not a long-term architecture source.

### v1 inventory

- Five flat `neko.agent-eval.scenarios.v1` manifests contain 18 cases: 13
  `single-prompt`, three `async-task`, one `explicit-skill`, and one `cancellation`.
- The runner also accepts `triggered-skill` and `model-binding`, but no committed case
  uses them. It rejects `message-queue`, `closed-loop`, `concurrent-tasks`, and
  `iterative-tasks` before spawning TUI.
- Every accepted kind currently executes the same single-message path. Only
  `cancellation` adds a timed `message.cancel`; terminal resize operations run after
  idle. There is no sequential-turn, queue-during-run, resume, feedback, or recovery
  controller.
- The canonical runtime path is `session.create -> message.submit ->
  session.waitForIdle -> terminal.resize* -> session.facts -> session.dispose`. It
  starts `neko debug automation --stdio`; there is no direct `AgentSession` runner.
- CLI input is limited to `--cwd`, `--prompt`, `--manifest`, `--case`,
  `--timeout-ms`, and `--dry-run`. `NEKO_DEBUG_COMMAND` overrides the spawned binary.
- The 20 executable assertion kinds are: `runtime-errors-empty`,
  `final-answer-non-empty`, `final-answer-contains`, `final-answer-not-contains`,
  `no-user-internal-continuation`, `task-created`, `task-terminal`,
  `continuation-facts-present`, `conditional-regeneration-when-quality-issue`,
  `content-access-used`, `image-analysis-evidence`, `canvas-handoff-attempted`,
  `skill-triggered`, `skill-active`, `skill-activation-attempts-only`,
  `tool-call-succeeded`, `tool-call-failed`, `tool-call-not-called`,
  `timeline-order`, `active-message-cancelled`, and `markdown-path-events`.
- Setup supports only contained `remove-path` and `write-file`. Post-checks support
  contained `file-exists`/`file-absent` and a suffix-glob `canvas-json` scan. Workspace
  path traversal and existing symlink crossings are rejected.
- Four cases declare `judge.kind = rubric`. No runner code reads or executes `judge`,
  so all four are metadata-only. There is no Judge adapter, scoring result, repeated
  sampling, baseline, comparison, cost, or variance support.
- Manifest schema, unsupported case kinds, assertion kinds, setup kinds, and
  post-check kinds fail before spawn. Unknown object fields, unknown top-level fields,
  `surface`, `expectations`, `judge`, media model/profile fields, and several nested
  fields are accepted without strict executable semantics.
- Success is one JSON object on stdout containing setup evidence, assertion/post-check
  evidence, and raw facts. Failure is a label on stderr plus exit code 1, 2, or 3.
  There are no versioned report files, artifact manifest, sanitized summary, retention
  policy, report id, or non-comparable outcome.

### Debug controls and facts

- Generic controls are `session.create`, `session.resume`, `message.submit`,
  `message.cancel`, `terminal.resize`, `session.waitForIdle`, `session.facts`, and
  `session.dispose`. The v1 evaluation runner does not use `session.resume`.
- Facts expose session/conversation ids, readiness, chat provider/model/profile,
  structured idle concerns, turn summaries, optional raw history, untyped Skill
  lifecycle records, minimal task projections, queue snapshot, continuation facts,
  string runtime errors, Canvas summaries, and bounded Markdown path events.
- Only Markdown path events expose a dropped count. Skill identity/fingerprint,
  effective configuration digest, media models, typed diagnostics, stable artifact
  facts, usage/cost/timing/retry, prompt fragment hashes, and completeness for other
  bounded collections are absent.
- `skill-active` performs JSON substring matching over `unknown[]`; content access and
  image page evidence use heuristic tool-name/serialized-value matching. These cannot
  prove Host Skill identity, exact provider/profile application, durable artifact
  identity, or no-fallback.

### Fixtures, credentials, and blockers

- Portable Skill cases use an isolated `/tmp` workspace and poison the retired
  `.neko/skills` path. Markdown cases also use `/tmp`.
- Creative and perception cases default to `~/Git/neko-test`; EPUB cases additionally
  require environment variable `A` and private local assets. The stream manifest
  currently commits `/Users/feng/Git/neko-test`, a machine-specific absolute path that
  v2 must reject.
- Real runs require a valid user Agent config, reachable provider endpoints, chat/media
  model availability, credentials, and any domain fixtures. The runner has no
  credential preflight and its CLI never populates `apiKey`; absent/invalid provider
  state is observed only after TUI spawn.
- Media cases additionally require image generation and perception providers. Canvas
  and EPUB cases require owning capabilities/validators and local assets. Current
  reports cannot distinguish all credential, network, quota, missing model, missing
  fixture, target behavior, and evaluator failures reliably.
- `pnpm test:agent:eval` and `--dry-run` are key-free harness evidence only. No stored
  real provider-backed report is part of the current surface.

## Scenario Ownership and Coverage

| Manifest / case | Owner | Current group | Audit finding |
| --- | --- | --- | --- |
| creative / `cat-play-image-analysis` | Skill `media-quality-review` plus Agent-runtime task/perception | workflow, quality | Cross-owner mega-case; overlaps both perception cases. Split Skill quality from runtime routing. Rubric is metadata-only; no artifact digest or negative provider/task failure. |
| creative / `storyboard-distinct-image-video-prompts` | Skill `storyboard` | canonical, quality | Useful canonical output intent; rubric is metadata-only. Missing paraphrase, boundary, artifact, regression, and holdout. |
| creative / `comic-description-canonical-storyboard-skill` | Skill `storyboard` | canonical, regression | Partly duplicates the prior storyboard case but uniquely poisons retired Skill identity. Keep as regression/negative routing coverage. Host identity/fingerprint is unproven. |
| creative / `blame-epub-storyboard-to-canvas` | Workflow: content access + `storyboard` + Canvas handoff | workflow, artifact, quality | Private fixture and broad cross-owner assertions. Canvas scan is outside the selected workspace and lacks stable artifact/provenance/validator identity. Rubric is metadata-only. |
| creative / `blame-epub-canonical-storyboard-skill` | Skill `storyboard` plus Agent-runtime content/perception routing | workflow, regression | Duplicates source and storyboard behavior from neighboring cases; retains valuable retired-Skill no-fallback intent. Needs typed content/page and Host Skill evidence. |
| creative / `lamp-god-epub-animation-plan` | Workflow: content/perception + Prompt/Skill planning behavior | workflow, quality | Target owner is ambiguous and no Skill identity is asserted. Private fixture; rubric is metadata-only. Must identify a Prompt/Skill owner or explicit runtime workflow owner before migration. |
| perception / `image-analysis-uses-perception-tool-when-chat-differs` | Agent-runtime perception/model routing | canonical, workflow | Positive branch has explicit chat model but does not prove effective perception model/profile, generated artifact identity, or no alternate fallback. |
| perception / `image-analysis-uses-native-chat-vision-when-chat-matches-perception` | Agent-runtime perception/model routing | boundary, regression | Valuable complementary no-tool branch. `tool-call-not-called` alone does not prove native image context was used or model/profile matched. |
| portable Skill / `explicit-system-skill-creator` | Skill `skill-creator` | canonical | Proves name only through untyped substring facts. Missing Host source/root/location/fingerprint, negative activation, paraphrase, and holdout. |
| portable Skill / `native-create-project-skill` | Agent-runtime `CreateSkill` capability/tool | canonical, artifact, regression | Strong poison and real-file checks. Missing package fingerprint, typed artifact/provenance, validator result, task identity, and explicit no-generic-write evidence. |
| portable Skill / `native-create-rejects-invalid-skill` | Agent-runtime `CreateSkill` capability/tool | failure | Useful fail-visible input validation. Missing assertion that no fallback writer/tool participated. |
| portable Skill / `native-create-rejects-resource-traversal` | Agent-runtime `CreateSkill` capability/tool | failure, boundary | Useful security boundary. Setup/post-check containment is covered, but symlink and absolute-path variants are missing. |
| portable Skill / `native-create-rejects-existing-target` | Agent-runtime `CreateSkill` capability/tool | failure, regression | Useful user-data preservation case. Missing concurrent/conflict and atomicity evidence. |
| stream / `stream-tool-text-order-and-final-answer` | Agent-runtime TUI stream delivery/Markdown projection | canonical, workflow | Strong timeline and renderer path intent. Machine-specific cwd, single sample, no provider failure/retry or dropped-count checks outside Markdown. |
| stream / `active-stream-cancellation` | Agent-runtime cancellation/idle | failure, workflow | Valuable cancellation path. Timed cancellation is race-prone and lacks task/tool/continuation cancellation ordering and artifact cleanup evidence. |
| Markdown / `mixed-gfm-unicode-resize` | Agent-runtime TUI Markdown projection | canonical, boundary | Covers rich syntax, Unicode, resize and same revision. Output structure is not deterministically asserted; provider variance remains. |
| Markdown / `incomplete-fence-table-streaming` | Agent-runtime TUI Markdown projection | boundary, regression | Covers transient incomplete syntax but only final facts are read; does not prove intermediate ordering beyond bounded path events. |
| Markdown / `unsafe-terminal-controls-in-markdown` | Agent-runtime TUI Markdown projection/security | failure, boundary | Good adversarial intent, but no assertion proves controls were encoded inert rather than merely traversing Markdown events. |

### Aggregate gaps and migration decisions

- Skill-owned suites: `skill-creator`, `storyboard`, and `media-quality-review` need
  full Host identity plus development fingerprint. `CreateSkill`, perception routing,
  task/continuation, cancellation, streaming, and Markdown are Agent-runtime suites.
- `lamp-god-epub-animation-plan` is blocked on a single explicit target owner.
  Cross-domain workflows may reference multiple suites but must not duplicate runner or
  assertion code.
- Existing coverage is concentrated in canonical/workflow cases. There are no explicit
  paraphrase or holdout cases, no approved baseline, no repeated samples, and no
  regression comparison. Artifact coverage exists only for portable Skill files and a
  weak Canvas glob scan.
- Negative coverage is strongest for `CreateSkill`; Skill activation, provider/model,
  task/recovery, artifacts, Judge failure, configuration mismatch, and report redaction
  need fail-visible cases.
- v2 migration should merge only duplicated prompts/fixtures, not distinct ownership or
  no-fallback intent. v1 remains validation-only during migration and must not become a
  second execution path.
