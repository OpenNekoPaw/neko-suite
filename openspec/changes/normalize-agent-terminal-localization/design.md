## Context

Agent terminal output currently crosses several paths: Ink components, slash-command router, hooks, host ports, shared Agent handlers, startup/status chrome and one-shot CLI output. Some discovery labels are localized, but execution paths still construct English strings directly. Adding more message keys without changing ownership would leave the same architectural hole.

This design treats localization as a presentation contract rather than a string-replacement exercise. It deliberately stays within a local desktop product boundary: one process composition, one terminal invocation, local configuration and deterministic tests.

`packages/neko-agent/packages/cli-tui` already has the manifest package name `@neko/cli`. References to CLI ownership in this design mean that existing package; they do not propose another independent CLI or presentation subpackage.

The design is intentionally capped at eight cross-cutting decisions. If implementation evidence introduces concerns that would push the design beyond ten decisions, the design SHALL be regrouped around clearer responsibilities and interfaces instead of appending another decision chain.

### Five-layer analysis

| Layer | Design answer |
| --- | --- |
| Responsibility | Domain/runtime code returns semantics; terminal Presenter owns Agent-generated human wording. |
| Dependency | Feature code depends on narrow presentation contracts; `@neko/shared` provides i18n primitives but owns no Agent vocabulary. |
| Interface | One immutable presentation context, typed message keys, semantic results/diagnostics and one generic human-status projection composed from canonical domain/runtime read models. |
| Extension | New commands add semantic results and owned bundle keys without changing locale resolution or inventing local translators. |
| Test | Bundle parity, locale matrices, path-level Presenter tests, inventory closure and focused residual searches prove the canonical path. |

## Goals / Non-Goals

### Goals

- Make all Agent-owned human terminal text consistently localizable.
- Establish one canonical string-generation boundary and remove final prose from lower layers.
- Keep UI locale, prompt asset locale and response language conceptually separate.
- Preserve command syntax and machine contracts across locales.
- Fail visibly for invalid built-in localization or invalid explicit Locale configuration.
- Provide a practical first migration slice without declaring partial migration complete.

### Non-Goals

- Runtime locale switching or live configuration reload.
- A second i18n service, terminal document AST, universal localized DTO or general error framework.
- Translating external identifiers or requiring third-party translation completeness.
- Locale-specific configuration commands, mutation receipts, status matrices or TOML editing infrastructure.

## Decisions

### 1. One terminal presentation boundary owns human strings

All Neko-owned human-readable terminal output passes through an explicit Command Presenter or equivalent terminal presenter. The presentation context is created once during terminal composition and contains:

```ts
interface AgentTerminalPresentationContext {
  readonly uiLocale: SupportedLocale;
  readonly t: AgentTerminalTranslate;
  readonly format: AgentTerminalFormatters;
}
```

Routers orchestrate commands and Presenters compose output. Host ports, hooks, providers, command handlers and runtime/domain services return typed data, `void`, or typed diagnostics rather than final success/error sentences. Each command family owns a small focused semantic result and a statically imported Presenter. The router invokes the handler and its canonical Presenter, then may place the rendered `output`/`error` string into the existing outer `TuiCommandRouterResult`; that outer type is a terminal projection contract, not a domain result. `projectCommandResult`, conversation-store projection and the existing TUI message protocol therefore do not need a semantic-result rewrite. Ink and non-Ink adapters consume the same semantic result so layout may differ without changing meaning.

Status follows the same ownership rule. Its semantic projection contract and pure Presenter are defined in a dedicated package-private module inside the existing `cli-tui` package, adjacent to but separate from command routing. It is not exported from the package public index and does not create a new package. The router consumes the contract but does not own its shape. The projection composes canonical read models exported by the owning domain/runtime boundaries and contains no preformatted Neko-owned `*Summary` strings. The TUI does not define parallel media-model, Skill, task, usage or execution DTOs. If an owning boundary lacks a reusable read model, that boundary defines the canonical type; `cli-tui` only composes it for terminal presentation. `useSlashCommands` remains the TUI composition adapter. For one `/status` request it captures each owning Zustand store exactly once, then directly constructs one readonly invocation-time semantic snapshot through the injected status provider. Fields are projected from those captured references; repeated reads of the same store are prohibited. Cross-store atomicity is not introduced: the result is a best-effort coherent view at command time, without locks, versions, subscriptions, caches or synchronization protocols. The package-private status module does not import Zustand stores, React hooks, configuration readers, path APIs, filesystem facilities or `useSlashCommands`. Its Presenter is a pure projection of snapshot plus presentation context. The router invokes the provider and Presenter but does not read stores or compose status prose. No Status service, repository, Snapshot Builder or synchronization layer is added; a pure projector may be extracted only after a second real composition adapter demonstrates duplicate mapping. The Presenter exclusively owns localized labels, state words such as active/default/disabled/running, human count/date/duration/byte formatting, row ordering, punctuation and line breaks. Stable IDs and external detail remain semantic values.

This boundary is fail-visible: missing keys, missing required semantic fields or missing canonical Presenter wiring are contract failures, not reasons to emit English fallback or an empty result. Built-in Presenters use static imports and direct exhaustive dispatch; no runtime Presenter registry, string-key lookup, fallback Presenter, global all-command result union or universal command AST is introduced.

Output ownership is classified by channel, not by the CLI runtime class or command name. Interactive, validation and utility commands may each expose a human projection and a machine projection. Neko-owned human stdout/stderr, including one-shot wrappers, config/experiment terminal notices and Commander help/usage/option descriptions, enters the presentation boundary. Model responses, custom content and external detail remain semantic values and are not translated as owned messages.

Message bundles contain plain text and interpolation placeholders only. ANSI escapes, Chalk styles, Ink component markup, terminal-width padding, wrapping and other device layout remain in Ink/plain-terminal adapters after translation. The same semantic result and localized text can therefore serve Ink, non-Ink and deterministic tests without embedding renderer syntax in bundles.

A Presenter owns semantic rows, their ordering and which values belong on one row. A terminal adapter owns physical wrapping, continuation indentation, truncation and available-width behavior. Ink and non-Ink adapters may produce different physical line breaks but preserve the same semantic fields and ordering. Bundle text contains no fixed-width padding. Language punctuation and natural-language spacing belong to complete translated messages; table separators, menu markers and tree glyphs belong to adapters. No global CJK punctuation or spacing post-processor rewrites translated, external, path or identifier values.

### 2. Reuse shared i18n infrastructure with semantic bundle ownership

`@neko/shared` remains Layer 0 infrastructure and owns `SupportedLocale`, shared interpolation and generic bundle validation. The strict primitive and its minimal readonly contracts are exported from the existing `@neko/shared/i18n` entrypoint; no new i18n/localization package or terminal-specific shared runtime is created. It remains free of Node, React, filesystem, environment and owner-bundle dependencies. It adds one small strict composition primitive, conceptually:

```ts
createStrictTranslator({ locale, bundles })
```

The primitive accepts only an already resolved `SupportedLocale`, merges statically supplied validated owner bundles and returns an immutable translator. Missing selected-locale keys, unresolved keys, namespace collisions, invalid bundles and key/placeholder parity violations fail visibly. Validation and placeholder compilation occur once when the invocation translator is created; `t()` does not rescan all bundles. The primitive performs no locale detection, source resolution, mutation, React integration, file access, environment access, dynamic import, registry lookup, English fallback or key-as-output fallback. Terminal composition creates one translator per invocation without a global singleton or mutable translator cache.

The existing mutable/fallback `I18nService` remains unchanged for Webview consumers. Terminal composition does not call `setLocale()` and does not depend on that service's current-locale → default-locale → key fallback behavior. This extends shared infrastructure without introducing a second package-local i18n runtime.

Message ownership remains semantic and uses flat namespaced bundles:

- `@neko/agent` owns reusable `agent.command.*` command semantics and diagnostics, colocates its `en`/`zh-cn` bundles, derived key type and parity tests, and exposes them through one narrow terminal-message module rather than its root barrel.
- The existing `cli-tui` package (manifest name `@neko/cli`) owns and colocates package-private `agent.terminal.*` startup/status chrome, terminal labels, menus, layout wording and terminal wrappers. Its bundle is not a general UI catalog.
- `@neko/cli` statically imports the Agent terminal-message module and its own bundle, then validates and merges both owners into one strict translator. `@neko/agent` never depends on `@neko/cli`; no central repository-wide message catalog, filesystem discovery, runtime glob, plugin contribution, network locale pack, lazy locale chunk or bundle registry is introduced.

Each owner defines its canonical English bundle as the key source of truth and derives its key union from that value:

```ts
const en = { /* flat namespaced messages */ } as const satisfies MessageBundle;
type OwnerMessageKey = keyof typeof en;
```

The terminal translator accepts the union of the two owner key unions. There is no duplicated handwritten enum, protobuf schema, code generation or repository-wide key registry. For each owner, built-in `en` and `zh-cn` bundles require exact key parity and exact interpolation-placeholder-name parity. Parameters remain the deliberately small `Readonly<Record<string, string | number>>` contract rather than generated per-key parameter interfaces. Invalid built-in composition fails type/tests and terminal bootstrap visibly. Strict messages support named placeholders only, using stable identifier names such as `{modelId}` or `{count}`. Positional placeholders, property access, nesting, conditions, plural expressions, formatter pipes and runtime code are invalid. `{{` and `}}` encode literal braces; malformed or unclosed braces fail bundle validation. At translation time the supplied parameter names must exactly equal the selected message's placeholders: missing parameters, extra parameters and `undefined` fail visibly. Parameter values are inserted once, are not recursively interpolated, translated, trimmed or locale-normalized, and terminal-safe quoting remains an explicit caller formatter responsibility.

Messages represent complete independently translatable semantic units rather than sentence prefixes, connectors or suffixes that callers concatenate. Stable IDs, paths and human-formatted values enter through placeholders. Multiline output is composed from atomic semantic row messages plus stable values. For the small number of English singular/plural distinctions, the Presenter selects explicit owner keys such as `.one` and `.other`; every supported bundle keeps exact key parity even when Chinese variants have identical wording. The translator never infers plurality from English text. This change does not introduce ICU MessageFormat, Fluent, a plural DSL, generated message-parameter types or locale-specific Presenter copies. Only proven-reused CLI layout helpers such as line joining or key/value rows are extracted; no full terminal rendering AST is introduced.

Menu projection follows the same boundary. Handlers return semantic options and accept stable selected IDs or canonical identities. The command-family Presenter owns terminal title, label, description and active/default/disabled wording and may produce the existing `TuiSelectionItem` terminal projection. Selection logic never parses a localized label, and no generic Menu AST is added.

### 3. Resolve UI and prompt locales once with one coherent model

`uiLocale` controls Agent-owned human terminal presentation. `promptLocale` selects built-in prompt/Skill/capability assets. Model response language remains controlled by explicit user instruction and conversation context.

Both preferences use the same vocabulary:

```text
auto | en | zh-cn
```

Their canonical explicit entrypoints are intentionally one-to-one:

| Preference | CLI | Environment | User TOML |
| --- | --- | --- | --- |
| UI | `--ui-locale` | `NEKO_UI_LOCALE` | `ui_locale` |
| Prompt | `--prompt-locale` | `NEKO_PROMPT_LOCALE` | `prompt_locale` |

A generic `--locale` is not added. The legacy `NEKO_LOCALE` entrypoint is removed with the package-local locale runtime and receives no alias, deprecation adapter, warning bridge or UI/prompt fan-out behavior.

They are independently configurable but resolved coherently:

```text
UI precedence:     CLI → environment → user config → host detection
Prompt precedence: CLI → environment → user config → resolved UI
```

- Source adapters preserve the distinction between absence and a structurally present raw string. They do not trim, lowercase, normalize, alias, select precedence or provide fallback. A single validator owns explicit-source parsing.
- Exact explicit values are strict. Only `auto`, `en` and `zh-cn` are valid; values such as ` zh-cn`, `zh-cn `, `ZH-CN`, `zh`, `zh_CN`, `zh-TW`, `en-US` and the empty string fail visibly rather than being repaired.
- Host detection is a separate permissive adapter. When no explicit Locale wins, it follows the operating system's preferred language, maps Chinese families to `zh-cn`, and resolves an unsupported or unavailable preferred language to `en`. It does not scan secondary preferred languages for a supported alternative.
- On macOS, one invocation-scoped Node/Bun adapter reads the first `AppleLanguages` entry with fixed `/usr/bin/defaults` arguments and no shell; that UI preference is authoritative over conflicting POSIX environment or Intl values. On other platforms, process locale sources use `LC_ALL → LC_MESSAGES → LANGUAGE → LANG → Intl.DateTimeFormat().resolvedOptions().locale`, including encoding/modifier removal and the first `LANGUAGE` token. The adapter runs once during bootstrap and does not maintain a module-level mutable cache, watcher or command-time re-read.
- Prompt `auto` or omission follows the resolved UI locale. Only an explicit concrete prompt value may differ.
- All structurally present explicit sources, including empty values and forbidden workspace keys, are validated before selection so precedence cannot hide invalid configuration.
- Bootstrap captures every raw source once, may use the normalized detected locale for configuration diagnostics, then follows one fixed composition order: capture sources → validate all explicit sources → resolve `uiLocale`/`promptLocale` → validate owner bundles → create the strict translator → create the immutable presentation context → expose commands and render Ink. Source readers are not retained. Command execution, React rendering and Agent runtime code never re-read locale configuration/environment or re-detect host locale.
- The command router receives that presentation context through explicit parameter injection. The Ink tree receives the same object through a package-private React Context. That React Context is transport only: it owns no locale state, setter, detection, bundle registry or fallback behavior.
- `auto` is a source/configuration mode only. Resolution produces concrete `SupportedLocale` values for both UI and prompt; no downstream AgentSession, PromptContext, Skill loader, capability loader, tool-description projector, compressor or SubAgent receives `auto`.
- Terminal composition and Agent runtime assembly name the product-level dependency `promptLocale: SupportedLocale`. A prompt-domain-local context may retain a field named `locale` when unambiguous, but the boundary maps from `promptLocale` once and does not expose an optional free-form `locale?: string` as the canonical invocation input.
- Locale preferences do not enter merged `UnifiedConfig`, because that contract includes workspace configuration. User raw preferences are read separately, resolved once, and supplied as invocation runtime input; workspace merge cannot override them.
- The same concrete `promptLocale` is passed to every built-in prompt-bearing path: system prompt, built-in prompt modules, built-in Skills, capability catalogs/prompts, tool-description projection, validation/recovery, compression, Agent/task creation and AgentSession assembly. Those paths do not re-read sources, re-detect, derive from UI or use `locale ?? 'en'`.
- Built-in paths touched by this change use canonical `SupportedLocale = 'en' | 'zh-cn'`. They do not branch on or normalize `zh`, `zh-CN` or arbitrary strings. External contribution protocols outside the canonical path are not expanded into a repository-wide locale migration by this change.
- SubAgents, task continuations and invocation-owned background Agent workflows inherit the parent's concrete `promptLocale`; they do not resolve `auto` or host locale again. A future per-task language requirement must be explicit task/user instruction, not another implicit locale resolver.
- Resume resolves Locale for the new invocation. Conversation history does not persist an active prompt locale and existing messages are not translated or rewritten; only newly assembled built-in prompt assets use the new invocation value.
- Custom Skill content, workspace prompts/instructions, user input, conversation history and external MCP/provider/tool/contributor text remain unchanged. `promptLocale` selects only Neko-owned built-in localized assets and does not create an automatic translation layer or third-party parity requirement.

### 4. Persist Locale only in user configuration and use restart activation

Canonical persisted keys are:

```toml
ui_locale = "zh-cn"
prompt_locale = "auto"
```

Only user configuration may contain these keys. Workspace `ui_locale` or `prompt_locale` is an ownership violation because both configure the local Agent runtime, not project semantics. Project language requirements belong in project Skills, prompts, instructions or capabilities.

Users edit the canonical user configuration file directly:

- exact `auto` is an explicit automatic value;
- removing a key means omission/inheritance;
- CLI/environment overrides use the canonical paired entrypoints above, are invocation-only and never persist;
- editing the file does not change an already composed invocation;
- the next invocation performs ordinary discovery, strict validation and resolution.

No Locale set, unset, status, path or open command is added. There is no Locale mutation DTO, TOML mutator, pending marker, activation receipt, file watcher or active-versus-persisted observation API.

### 5. Keep diagnostics and human value formatting semantic

A terminal diagnostic separates:

```ts
interface TerminalDiagnostic {
  readonly code: string;
  readonly messageKey: AgentTerminalMessageKey;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly externalDetail?: string;
}
```

The code is stable and locale-neutral. Neko-owned wording is localized by the Presenter, which may place the rendered error in the outer terminal projection result. External provider/tool detail remains unchanged under a localized wrapper and is never promoted into an owned message bundle. Expected command failures use typed diagnostics; programming errors, impossible states and missing canonical wiring remain fail-visible and are not converted into user diagnostics.

Raw explicit Locale values shown in human bootstrap diagnostics are quoted, escaped and bounded by one terminal diagnostic-literal formatter so control/ANSI/bidi content cannot corrupt terminal output. Machine protocols use their existing structured encoding and do not parse localized stderr.

Counts, dates/times, durations and byte sizes are formatted only through small explicit semantic formatters using `uiLocale`. Human numbers use locale-aware number formatting. Absolute date/time formatting uses `Intl.DateTimeFormat` with explicit options and one system time-zone value captured during invocation composition; Presenters do not re-read or infer host time-zone state. Domain values that already contain an offset or time-zone retain that semantic meaning. Tests fix locale, time zone and input instant. Durations use an explicit duration value/unit rather than date APIs or relative-time prose. Byte sizes use fixed binary units `B`, `KiB`, `MiB` and `GiB`, with centralized rounding/precision and locale-aware numeric portions; unit tokens remain stable. No user time-zone, unit-system, precision profile, formatter registry or locale-specific formatter branch hierarchy is added. IDs, ports, versions, enum-like values and serialized data remain unchanged.

Human success/output is written to stdout; expected human diagnostics are written to stderr. Programming errors and bootstrap/contract failures remain fail-visible on stderr and terminate with a non-zero exit code. Localization changes neither channel selection nor exit/diagnostic codes. Commander-owned parse failures are captured by a narrow CLI adapter into typed terminal diagnostics; Neko command descriptions, arguments, options, usage wrappers and examples are owned messages, without forking Commander or introducing a general CLI framework.

### 6. Preserve syntax, identifiers and machine contracts

The following remain byte-for-byte stable across locales:

- slash command names and aliases;
- argument tokens and option IDs;
- provider/model/tool/artifact identifiers;
- diagnostic codes and JSON field names;
- structured logs, debug automation and evaluation protocols.

Human and machine output are separate projections of semantic results. A structured-output mode bypasses sentence localization and retains the same schema in every locale.

Machine stdout is exclusive: JSON output, debug JSONL frames, structured logs, evaluation facts/protocols, shell completion scripts and machine-readable experiment data contain no localized banner, warning or progress prose. Once debug stdio/JSONL protocol mode starts, stdout carries protocol frames only; expected failures use the existing structured diagnostic frame, while programming/bootstrap failures may use stderr plus a non-zero exit. No localized JSONL message field is added, and protocol consumers never parse localized stderr.

Shell completion script content, command/option tokens and shell identifiers remain locale-neutral; only human invocation errors or outer help may be localized. Experiment terminal chrome/progress/final summary is human presentation, but generated JSON reports and Markdown report bodies, their schemas, suite/variant/fact identifiers and assertions remain evaluation/report-domain artifacts outside terminal bundles. Any report-content localization requires a separate owning-domain change.

External provider, tool and contributor text is not localized by a new generic adapter in this change. Existing external detail remains unchanged under a localized Neko-owned wrapper, and stable identifiers remain unchanged. Any future contributor locale contract belongs to its owning domain change rather than this terminal localization contract.

### 7. Use generic `/status` only to discover the user config path

Because Locale has no management command, the existing generic `/status` human projection includes one configuration-location row. It does not become a Locale Status API and does not read or summarize configuration.

The generic human-status snapshot is a package-private terminal projection contract in the existing `cli-tui` package, not a second domain model or public package API. It is separated from `tui-command-router.ts` so routing does not own presentation shape, but no new subpackage or public-index export is introduced. It composes canonical read models from their owning domain/runtime boundaries and adds the terminal-host value required for configuration discovery. Conceptually:

```ts
interface TuiStatusSnapshot {
  readonly execution: CanonicalExecutionStatus;
  readonly modelSelections: CanonicalModelSelectionSnapshot;
  readonly usage: CanonicalUsageSnapshot;
  readonly skills: readonly CanonicalSkillReference[];
  readonly runningTask?: CanonicalTaskReference;
  readonly userConfigPath: string;
}
```

The names above describe responsibilities rather than prescribe new type names. Implementation first reuses existing exported canonical types; when a reusable read model is missing, it is defined at the owning domain/runtime boundary. `cli-tui` SHALL NOT introduce parallel `TuiMediaModel`, `TuiSkill`, `TuiTask` or equivalent domain DTOs, nor preserve preformatted fields such as `mediaModelSummary`, `activeSkillSummary` or `runningTaskSummary`. It also does not introduce a universal status row/value AST. Snapshot immutability is expressed through readonly TypeScript contracts and construction discipline; no `Object.freeze`, deep clone, mutation proxy or immutable-collection framework is added.

Terminal composition calls shared `getUserConfigPath()` exactly once per invocation and passes the captured absolute path into the `useSlashCommands` composition adapter. For each `/status` request, that adapter captures each owning store once and produces the semantic snapshot without formatting prose. Required contract data such as `userConfigPath` fails visibly when absent. An unavailable optional capability remains semantic absence and causes its row to be omitted; composition does not substitute empty strings, `unknown`, `N/A`, hard-coded English or legacy summaries. A genuinely displayable unavailable/unknown condition must be an explicit semantic state localized by the Presenter. The pure status Presenter receives only the snapshot and immutable presentation context; it does not import or invoke stores, configuration readers, path APIs or filesystem facilities. The router delegates status rendering and owns neither state access nor status string composition. No additional Status service, repository or synchronization layer is introduced. The Presenter owns status labels, localized state words, human-value formatting and row layout; for the configuration row it localizes only the existing `cli-tui`-owned label and renders the path unchanged.

The path is not contracted to `~`, converted to a relative path, normalized, translated or duplicated. Missing injection fails visibly; the Presenter and command-time provider do not call persistent configuration-file readers or path-resolution APIs or reconstruct a fallback; the composition adapter may read already-composed canonical store/runtime state. File existence and contents are irrelevant. JSON/debug/evaluation schemas are unchanged.

### 8. Migrate incrementally but gate the complete capability

The OpenSpec task list is the owned-output inventory and migration checklist. It tracks output families and sinks rather than duplicating every translation key; no separate inventory document, localization manifest, runtime output registry or long-lived second checklist is introduced. The first implementation slice migrates model, media and perception commands because they expose the current inconsistency and exercise lists, current/default markers, menus, usage, validation and provider errors. Implementation order is fixed as shared strict translation → invocation locale/bootstrap context → owner bundles → model/media/perception first slice → remaining human-output inventory → legacy removal and complete gates.

After the slice, migration continues through remaining commands, startup/status chrome, one-shot output and shared Agent handlers. Each command family is one migration unit: semantic handler result, Presenter, bundles, tests and removal or poisoning of its obsolete prose/formatter/key path land together. Unmigrated families may remain visibly unmigrated during the sequence, but the new Presenter path never wraps them or lets a family retain two successful projections. Side-effecting select/reset/activate/clear/connect handlers return the actual canonical post-operation state rather than prose or a success value inferred only from input. Shared slash-command paths obey the same rule: legacy English strings are not wrapped, translated by detection, mapped back to keys or retained as dual-path compatibility output. The duplicate package-local `TuiLocale = 'en' | 'zh'`, `detectTuiLocale`, `getTuiLabels`, `formatTuiTemplate`, `formatTuiLabel` and `TUI_LABELS` runtime is removed after migration together with `NEKO_LOCALE` and the legacy module-level macOS locale probe/cache; the canonical invocation-scoped system-locale adapter remains, and the terminal uses canonical `SupportedLocale = 'en' | 'zh-cn'` without a `zh` alias, compatibility wrapper or dual path. “First Slice Ready” is evidence for the selected family only; the capability remains incomplete until the owned-output inventory is closed.

Three focused gates prevent regression:

1. typed message-key ownership;
2. exact built-in bundle/placeholder parity;
3. table-driven command-family output matrices for `en` and `zh-cn`, combined with deterministic formatter tests using fixed locale/time-zone/input, semantic-row/order assertions, a small reviewed golden set for `/status`, Commander help and the first command family, strict-translator failure tests, shared-context identity tests, concrete prompt-locale propagation/inheritance/resume tests, human/machine stdout-stderr and protocol-exclusivity tests, Commander diagnostic projection tests, plain-text bundle tests, legacy detector and `zh` fallback poison/removal tests, Webview `I18nService` compatibility tests, the owned-output inventory, existing repository checks and review-time residual searches. Golden output is not created per message and is never updated blindly; Ink width/styling tests remain adapter tests rather than bundle-parity tests.

No terminal-localization feature flag, percentage rollout, experiment cohort, remote kill switch, legacy locale mode or fallback-to-old-English runtime is added. Canonical bootstrap uses the new model directly and fails visibly when its contract is invalid. No localization telemetry schema or pipeline records user locale, key usage, fallback frequency or command language; existing local logging may carry an explicit bootstrap diagnostic without creating localization analytics.

Acceptance has three layers: focused `@neko/shared/i18n`, `@neko/agent` and `@neko/cli` tests including the first-slice matrices; repository type/test/legacy-debt/unused gates selected by impact; and focused `neko-agent-evaluation` only when implementation changes prompt-locale propagation, built-in prompt/Skill/capability/tool-description, AgentSession/SubAgent, validation/recovery or TUI Agent event projection. Key-free harness self-tests are not represented as real Agent behavior evidence, and no localization-specific CI/release service is added.

Documentation records stable contracts only. OpenSpec owns active design/tasks; after implementation, affected existing Agent/CLI package or domain architecture documentation is updated where the contract remains long-lived. No separate decision record, migration log, command output diary or timeline is added. README and paired language documents change only when their user-facing or semantic content is affected.

Internal terminal message keys cut over atomically with their canonical English bundle, `zh-cn` bundle, Presenter calls and tests. Prelaunch migration does not retain deprecated-key aliases, old-to-new maps, dual keys or missing-key fallback; focused tests may poison removed keys to prove the canonical path. This change does not introduce ICU MessageFormat, Fluent, a generic terminal/document AST, a formatter registry, locale-specific Presenter copies, a global CJK post-processor, configurable punctuation/spacing/unit profiles, reverse parsing of rendered English, a dedicated TypeScript AST checker, a new exception framework or production-only formatting state exposed for tests. If repeated regressions later prove the existing typed and test gates insufficient, a lint rule can be proposed separately with evidence. Capability Complete and archival require one checklist only: every task/inventory family closed; bundle/key/placeholder gates passing; canonical human output routed through Presenters; machine/protocol output locale-neutral; touched built-in prompt paths receiving one concrete prompt locale; old locale detectors, aliases, environment entrypoints, formatters, keys and dual success paths removed or poisoned; focused/repository/required evaluation gates passing; and commands, evidence and residual risk recorded. No readiness service, runtime localization status, maturity score, percentage-completion API or second release checklist is introduced.

## Risks / Trade-offs

- Migration touches several command families and may reveal lower-layer APIs that currently conflate side effects with wording.
- Strict bundles add maintenance cost but prevent mixed-language production output.
- Direct user-config editing is less convenient than a command, but avoids building a Locale management subsystem for two startup preferences.
- Absolute config paths expose local home paths in a user-requested local status view; they are not added to machine protocols or logs.
- Without a dedicated AST checker, complete migration depends on typed contracts, locale matrices, inventory closure, existing repository checks and focused review evidence.

## Migration Plan

1. Inventory owned output and define semantic result/diagnostic contracts.
2. Compose the terminal presentation context, strict bundles and Locale resolver.
3. Add the generic status snapshot path field and tests without changing machine schemas.
4. Migrate model/media/perception through the canonical Presenter and poison legacy string paths in tests.
5. Migrate remaining commands and non-command terminal surfaces.
6. Run parity, locale-matrix, package, existing repository and evaluation/quality gates; close the inventory and record focused residual-search evidence before declaring capability complete.
