# Agent Terminal Localization Glossary

## Agent-owned human terminal output

Human-readable wording created and controlled by Neko Agent for terminal users, including command results, startup/status chrome, menus, usage, success text and owned diagnostic wrappers.

## Machine output

Locale-neutral structured or tooling data consumed by programs, including JSON, debug JSONL frames, structured logs, evaluation facts/reports and shell completion scripts. Machine stdout never mixes localized banners, warnings, progress or summaries and never requires parsing localized stderr.

## Human projection

The localized terminal rendering of Neko-owned semantic data or diagnostics for people. It is selected by output channel rather than command/runtime class: human success uses stdout, expected human diagnostics use stderr, and programming/bootstrap/contract failures remain fail-visible on stderr with a non-zero exit.

## Protocol-exclusive stdout

A machine mode in which stdout carries only locale-neutral protocol frames after startup. Debug stdio/JSONL modes use structured expected-failure frames with stable codes; localized human prose is never inserted into the stream and consumers never parse localized stderr.

## Plain-text message bundle

An owner-controlled message bundle containing only text and interpolation placeholders. ANSI/Chalk styling, Ink markup, terminal-width wrapping, indentation and renderer-specific line composition belong to terminal adapters rather than translation messages.

## UI locale

The resolved `SupportedLocale` used for Agent-owned human terminal presentation. It is immutable for one invocation.

## Prompt locale

The independently configurable concrete `SupportedLocale` used to select Neko-owned built-in prompt, Skill, capability, tool-description, validation and compression assets. `auto` or omission is resolved before runtime construction and never enters AgentSession or child Agent paths. It does not determine model response language or translate custom/external content.

## Prompt Locale runtime input

The invocation-owned concrete `promptLocale: SupportedLocale` produced outside merged `UnifiedConfig` and passed consistently to built-in prompt-bearing paths, AgentSession assembly and child Agents. A prompt-domain-local context may map it to an unambiguous `locale` field, but no downstream path receives `auto`, re-detects host locale or silently defaults to English.

## Prompt Locale inheritance

The rule that SubAgents, task continuations and invocation-owned background Agent workflows receive the parent's concrete prompt locale. A resumed conversation instead uses the newly started invocation's resolved value for new prompt assembly while preserving all historical content unchanged.

## Locale mode

The shared preference vocabulary `auto | en | zh-cn`. Explicit values are exact and strict; only host-detected values may be normalized. Canonical paired entrypoints are `--ui-locale`/`NEKO_UI_LOCALE`/`ui_locale` and `--prompt-locale`/`NEKO_PROMPT_LOCALE`/`prompt_locale`; generic `--locale` and legacy `NEKO_LOCALE` are not canonical inputs.

## Raw Locale source

An invocation-scoped source-adapter result that distinguishes omission from a structurally present raw string. CLI, environment and configuration adapters do not trim, lowercase, normalize, alias, select precedence or fallback; one explicit-source validator owns those decisions, so an empty present value remains invalid rather than becoming omission.

## Host Locale detection

The only permissive Locale input path. It reads `LC_ALL → LC_MESSAGES → LANGUAGE → LANG → Intl`, normalizes detected syntax and maps Chinese families to `zh-cn` and neutral/other families to `en`. It runs once per invocation without macOS `defaults`, platform subprocesses or a module-level mutable cache.

## Locale configuration ownership violation

The presence of `ui_locale` or `prompt_locale` in workspace configuration. These are local runtime preferences and may persist only in canonical user configuration.

## Presentation context

The immutable invocation-scoped dependency containing resolved UI locale, strict typed translation and semantic human-value formatters. Terminal bootstrap creates it once; the router receives it explicitly and the Ink tree receives the same object through a package-private transport-only React Context.

## Semantic result

A small command-family or runtime-specific typed result that contains no final Neko-owned human sentence and can be projected by different adapters. It is not part of a global all-command union or universal command AST; side-effect results carry actual canonical post-operation state rather than prose inferred from input.

## Command Presenter

The canonical boundary that converts semantic results or diagnostics into localized human terminal output using the presentation context. Built-in command-family Presenters are statically imported and directly dispatched; no dynamic registry or fallback Presenter is used. Their rendered strings may be carried by the existing outer `TuiCommandRouterResult` terminal projection.

## Owned message

A localizable Neko-controlled message. Reusable Agent command semantics belong to `@neko/agent`; terminal labels, chrome, layout wording and wrappers belong to the existing `cli-tui` package, whose manifest name is `@neko/cli`. This ownership does not imply another subpackage.

## Complete semantic message

An independently translatable owner message that expresses one complete meaning and receives stable IDs, paths, numbers or other values through placeholders. Callers do not concatenate translated prefixes, connectors or suffixes. Required singular/plural distinctions use explicit parity-checked keys rather than an ICU/Fluent-style message language.

## Semantic row

A Presenter-owned grouping of fields that belong together in human terminal output. The Presenter owns row membership and ordering; terminal adapters may wrap, indent or truncate physical lines without changing the semantic fields or order.

## Human value formatter

A small explicit formatter for counts, absolute date/time, durations or byte sizes. It uses resolved `uiLocale`, an invocation-captured time zone where applicable, fixed semantic inputs and centralized unit/rounding rules without a registry or user-configurable formatting profile.

## Selective golden output

A manually reviewed complete-output fixture reserved for a few high-value compositions such as `/status`, Commander help and the first migrated command family. Ordinary messages use semantic and table-driven assertions; goldens are not generated per key or updated blindly.

## Stable token

A command name, argument, identifier, diagnostic code, enum-like value or machine field that remains unchanged across locales.

## Terminal diagnostic

A semantic expected-failure diagnostic containing a stable code, owned localized message key/parameters and optional unchanged external detail. Programming errors, impossible states and missing canonical Presenter wiring remain fail-visible rather than becoming user diagnostics.

## Diagnostic literal

An untrusted explicit configuration value formatted for human diagnostics through bounded quoting and escaping so it cannot control terminal presentation.

## Generic human-status snapshot

The package-private terminal projection contract inside the existing `cli-tui` package used by the human `/status` Presenter. `useSlashCommands` acts as its composition adapter, captures each owning Zustand store once per `/status` request and directly constructs a readonly best-effort coherent snapshot without cross-store transactions, caching, a builder or synchronization layer; the contract and pure Presenter are separate from command routing, are not publicly exported, do not import stores/config/path/filesystem dependencies, and read-only compose canonical read models exported by owning domain/runtime boundaries plus required `userConfigPath`; it contains no final Neko-owned `*Summary` prose, is not a parallel TUI domain model, Locale Status DTO or machine protocol. Required fields fail visibly when absent; optional capabilities use semantic absence rather than empty/`unknown`/`N/A`/English fallback. The Presenter owns localized labels/state words, human-value formatting and row layout. Readonly is a TypeScript contract, not runtime freezing or deep cloning.

## Invocation-scoped configuration path

The resolved absolute canonical user-config path captured once during terminal composition and reused by every generic status snapshot in that invocation.

## Direct locale configuration editing

The only persistence workflow in this change: users edit `ui_locale` and `prompt_locale` in canonical user configuration and restart. Exact `auto` is explicit automatic mode; removing a key expresses omission.

## Strict translator

An immutable translator created by the shared i18n strict composition primitive from an already resolved `SupportedLocale` and validated owner bundles. It reuses shared interpolation but performs no detection, mutation, React/file access, English fallback or key-as-output fallback; missing keys, collisions and invalid parity fail visibly. It is distinct from, and does not change, the existing Webview-oriented mutable/fallback `I18nService`.

## Owner bundle module

A narrow module colocated with an owning package's `en`/`zh-cn` terminal messages, derived key type and parity tests. `@neko/agent` exposes its module for static CLI composition; the CLI-owned module remains package-private. It is not a registry, central catalog or dynamic locale pack.

## Strict interpolation contract

The exact placeholder contract enforced by the invocation translator: named identifier placeholders only, `{{`/`}}` for literal braces, and a supplied string/number parameter set exactly equal to the selected message placeholders. Missing, extra, undefined or malformed inputs fail visibly, and values are inserted only once.

## Static bundle composition

Invocation bootstrap composition in which all supported owner bundles are imported by code, validated once and merged into one immutable translator without filesystem discovery, dynamic import, runtime registry, plugin contribution, lazy chunk or global singleton.

## Atomic message-key cutover

A prelaunch rename that updates the canonical English bundle, every translated bundle, Presenter callers and tests together. No deprecated alias, old-to-new map, dual key or fallback remains; removed keys may be poisoned in migration tests.

## Owner-derived message key

A typed flat namespaced message key derived from an owner's canonical English bundle. `@neko/agent` owns `agent.command.*`; the existing `cli-tui` package owns `agent.terminal.*`. Terminal translation uses the union of those owner key unions without a central catalog, handwritten duplicate enum, protobuf schema or code generation.

## Bundle parity

Exact equality of built-in `en` and `zh-cn` message keys and interpolation placeholder names for one owner bundle. Translation parameters remain a shared string/number record rather than generated per-key interfaces.

## Owned-output inventory

The finite list of production human-output sites that must be migrated before the localization capability can be considered complete.

## First Slice Ready

The model/media/perception command family has passed its scoped semantic, locale and legacy-path tests. It does not mean the full terminal capability is complete.

## Capability Complete

Every inventory item is migrated and all bundle, locale-matrix, package, existing repository, evaluation and quality gates pass, with focused residual-search evidence recorded.
