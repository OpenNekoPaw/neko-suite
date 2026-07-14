> **Lang:** English | [中文](./CONTRIBUTING_CN.md)

# Contributing Guide

Welcome to Neko Suite development! This document covers dev environment setup, code standards, and the PR process.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Environment Setup](#development-environment-setup)
- [Project Structure Overview](#project-structure-overview)
- [Development Workflow](#development-workflow)
- [Code Quality Tools](#code-quality-tools)
- [Code Standards](#code-standards)
- [Testing](#testing)
- [Submitting a PR](#submitting-a-pr)
- [Priority Contribution Areas](#priority-contribution-areas)
- [Debugging Tips](#debugging-tips)

---

## Prerequisites

| Tool    | Version          | Notes                             |
| ------- | ---------------- | --------------------------------- |
| Node.js | >= 20            | LTS recommended                   |
| pnpm    | >= 10            | `npm i -g pnpm`                   |
| Rust    | stable (>= 1.75) | `rustup toolchain install stable` |
| VS Code | >= 1.85          | Target host environment           |

**macOS additional dependency**: Xcode Command Line Tools (`xcode-select --install`)

**Linux additional dependencies**: `libavcodec-dev libavformat-dev libavutil-dev pkg-config` (FFmpeg dev headers)

---

## Development Environment Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-org/neko-suite.git
cd neko-suite

# 2. Install Node.js dependencies
pnpm install

# 3. Build the Rust engine (first build takes 2-5 minutes)
cd packages/neko-engine
cargo build                    # debug mode
# or: cargo build --release   # release mode (slower, better performance)
cd ../..

# 4. Build N-API bindings
cd packages/neko-engine/packages/host-napi
pnpm build
cd ../../../..

# 5. Full TypeScript build
pnpm build

# 6. Build VSIX artifacts for local installation or distribution
./build.sh --all
```

### VSIX Installation

The repository builds and packages VSIX artifacts. Installing those artifacts is handled by VS Code or the user environment:

```bash
# Build one extension VSIX
./build.sh --package neko-cut

# Build all release-ready VSIX artifacts
./build.sh --all

# Install a generated VSIX with the VS Code CLI
code --install-extension neko-cut-*.vsix
```

You can also use VS Code's "Extensions: Install from VSIX..." command and select the generated `.vsix` file.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for current package and extension boundaries.

---

## Project Structure Overview

```
neko-suite/
├── packages/
│   ├── neko-engine/     # Rust GPU media engine + VSCode extension integration (unified Sidecar process)
│   ├── neko-cut/        # Video editor (Extension + Webview)
│   ├── neko-agent/      # AI Agent (Extension + Platform + Webview)
│   ├── neko-types/      # @neko/shared infrastructure (Logger/i18n/Theme/Errors, zero dependencies)
│   ├── neko-client/     # @neko/neko-client streaming client + EngineClient (zero dependencies)
│   ├── neko-proto/      # @neko/proto Protobuf IDL definitions
│   └── ...              # Other packages (see README.md)
├── docs/                # Architecture, domain, research, and status docs
├── ARCHITECTURE.md      # System architecture overview
├── AGENTS.md            # Repository working rules
├── ROADMAP.md           # Long-term roadmap
└── TODO.md              # Active tasks for current iteration
```

See each package's `packages/*/README.md` for details.

**Dependency graph** (unified engine architecture):

```
@neko/proto                          <- Protobuf source (authoritative type contracts)
@neko/shared (neko-types)            <- Shared infrastructure (Logger/i18n/Theme/Errors, zero internal deps)
@neko/neko-client                    <- EngineClient HTTP dispatch + streaming client (zero internal deps)

@neko-engine/host-napi             <- Rust N-API bindings (independently compiled)
  ^
neko-engine ext                      <- Single Sidecar process + unified HTTP/WS server
  ^ (communicates via EngineClient HTTP/WS)
neko-cut ext -> @neko/shared, @neko/neko-client, @neko/platform
neko-agent ext -> @neko/agent, @neko/platform, @neko/shared
neko-tools ext -> @neko/shared, @neko/neko-client
neko-preview ext -> @neko/shared, @neko/neko-client
neko-canvas ext -> @neko/shared
neko-story ext -> @neko-story/parser, @neko-story/types, @neko/shared
neko-assets ext -> @neko/shared

All webviews -> @neko/shared, @neko/neko-client (as needed), React 18
```

**Key architecture points**:

- **Unified engine**: All extensions communicate with a single neko-engine Sidecar process via `EngineClient` (in `@neko/neko-client`)
- **Single port**: Consolidated from 3 separate ports down to 1 unified port (HTTP/WS)
- **Cross-cutting concerns**: Logger/i18n/Theme/Errors unified in `@neko/shared` with three-layer isolation (Core/VSCode/Webview)

---

## Development Workflow

### Developing a Single Extension

```bash
# Using neko-cut as an example

# 1. Start webview hot-reload dev server (Vite)
cd packages/neko-cut/packages/webview
pnpm dev            # Listens on http://localhost:5173

# 2. In another terminal, watch Extension changes (esbuild watch)
cd packages/neko-cut/packages/extension
pnpm watch

# 3. Press F5 in VS Code to launch Extension Development Host
# 4. For Webview visual/interaction acceptance, run a real functional scenario
pnpm test:webview:functional --owner neko-cut
```

Vite/browser validation is only a hot-reload aid or explicitly requested browser-compatibility check. Neko Extension Webviews ultimately run inside the VS Code sandbox. When a change affects visuals, layout, interaction, focus, CSP, Extension/Webview messages, media preview, or VS Code lifecycle, validate through Extension Development Host + the `vscode-extension-debugger` Skill. Do not use Chrome, the generic Browser plugin, Playwright, or `localhost` in a regular browser as the default runtime acceptance surface.

Each owning package maintains its core user scenarios under `scripts/webview-functional/scenarios/<owner>/` and the corresponding minimal synthetic workspace under `scripts/webview-functional/fixtures/`. Scenarios must operate visible UI through public host boundaries and assert UI state, the canonical message/command/service path, durable file or Engine results, lifecycle behavior, and runtime errors. They must not call private stores or handlers, add test-only business commands, or bypass project file services. The shared runner owns only the VS Code/Electron host, CDP adapter, closed operation schema, error policy, and report mechanics.

Raw reports are written to gitignored `reports/webview-functional/` and should be kept locally only as long as needed to reproduce the current issue; trusted pull-request CI artifacts default to 14-day retention. Screenshots, DOM, logs, and side-effect manifests must come only from isolated fixture workspaces, never a normal development window or real user workspace. OpenSpec, pull requests, and documentation may commit only redacted summaries containing the scenario id, command, host/version, result, failure classification, evidence location, and residual risk. Remove secrets, tokens, absolute user paths, and any non-fixture content before sharing.

### Developing the Rust Engine

```bash
cd packages/neko-engine

# Run Rust unit tests
cargo test

# Type-check only (no compilation)
cargo check

# Format Rust code
cargo fmt

# Lint
cargo clippy -- -D warnings
```

### Full Build

```bash
pnpm build                  # Full build (turbo parallel)
pnpm build:neko-cut         # Build a specific package only
pnpm build:ui               # Build all webviews only
pnpm build:core             # Compile Rust engine only
pnpm generate:types         # Regenerate Protobuf TS types
```

---

## Code Quality Tools

### Formatting (Prettier)

The project uses Prettier for consistent code style. See `.prettierrc.json` for configuration.

```bash
pnpm format          # Format all source files
pnpm format:check    # Check formatting (used in CI)
```

A pre-commit hook automatically formats staged files (Husky + lint-staged).

### Linting (ESLint)

The project uses ESLint flat config v9 (`eslint.config.mjs`) with typescript-eslint + react-hooks.

```bash
pnpm lint            # Lint all source files
pnpm lint:fix        # Auto-fix fixable issues
```

A pre-commit hook automatically runs `eslint --fix` + `prettier --write`.

**Rule details**:

- Production code: `@typescript-eslint/no-explicit-any: 'warn'` (warns but does not block)
- Test files: `'off'` (allows `as any` for mocks and test data)
- Test file patterns: `**/*.test.ts`, `**/*.spec.ts`, `**/__tests__/**`

### Dead Code Detection (Knip)

[Knip](https://knip.dev) detects unused files, exports, and dependencies. See `knip.config.ts` for configuration.

```bash
pnpm check:unused        # Detect unused code
pnpm check:unused:fix    # Auto-remove unused exports and dependencies
```

**Current baseline** (2026-03-14):

- Unused files: 5
- Unused exports: 435 (functions/constants)
- Unused types: 527
- Unused devDependencies: 16

**Cleanup strategy**:

- ~35% can be safely removed (barrel exports, utility functions)
- ~65% should be kept (Phase 2 feature types, public APIs)

### Architecture Rule Validation (dependency-cruiser)

[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) automatically validates architecture constraints. See `.dependency-cruiser.cjs` for configuration.

```bash
pnpm check:deps          # Check for architecture rule violations
```

Currently enforced rules:

| Rule                        | Severity | Description                                                                          | Status       |
| --------------------------- | -------- | ------------------------------------------------------------------------------------ | ------------ |
| `no-circular`               | error    | No circular dependencies                                                             | 0 violations |
| `layer0-no-internal-deps`   | error    | Layer 0 (@neko/shared, @neko/neko-client) must not depend on other internal packages | Passing      |
| `webview-no-vscode`         | error    | Webview packages must not import the `vscode` module                                 | Passing      |
| `extension-no-react`        | error    | Extension packages must not import React/ReactDOM                                    | Passing      |
| `no-cross-extension-deps-*` | warn     | Extension packages must not depend on each other directly                            | Passing      |

**Common circular dependency patterns and fixes**:

| Pattern                          | Example                                                                                | Fix                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Barrel re-import**             | `index.ts` defines interface -> impl imports from `./index` -> `index.ts` imports impl | Move interfaces to `types.ts`; both sides import from `types.ts`                              |
| **Hook/Service cross-reference** | Service depends on utility in Hook -> Hook depends on Service via barrel               | Extract utilities to a standalone `utils/` module                                             |
| **Inline `import()` types**      | `types.ts` uses `import('./impl').Class` to reference impl class                       | Define interface in `types.ts` (dependency inversion); impl class `implements` that interface |

### Coverage Configuration

All packages share vitest coverage settings via `vitest.shared.ts` (reporters, exclude patterns).

**Vitest version**: Unified to `^4.0.18` (root + all sub-packages)

**Coverage thresholds** (enabled):

- Lines: 30%
- Branches: 20%
- Functions: 25%
- Statements: 30%

**v4 notes**:

- Constructor mocks must use `function` syntax, not arrow functions
- Packages with no test files need `--passWithNoTests` in the `package.json` test script
- Stricter `package.json` exports resolution means incorrect alias paths will cause import failures

### One-Command Quality Check

```bash
pnpm check               # Runs both Knip + dependency-cruiser
```

Changes that touch residual/debt terms or redundant code need explicit checks:

```bash
pnpm check:legacy-debt   # Scans legacy/fallback/deprecated debt surfaces
pnpm check:unused        # Checks unused files, exports, and dependencies
```

If `pnpm ci:local` was run, it already covers `pnpm check` and `pnpm check:quality`; still record which command covered residual/redundancy checks in the delivery notes.

### Local CI Checks

Before opening a PR, run the local CI-equivalent checks that match the impact area:

```bash
pnpm ci:local            # General gates plus key-free Agent eval harness tests
pnpm ci:local:rust       # Rust engine changes
pnpm ci:local:proto      # Proto contract and generated type sync
```

Agent development must separate the key-free baseline from evaluation scenario
acceptance. CI and the default `pnpm test` remain key-free. Local changes that
affect provider/model selection, AI SDK message projection, prompt or Skill
behavior, tool schemas, AgentSession workflow, validator/recovery policy, or
TUI/GUI projection of live Agent events must run a focused
`scripts/agent-eval` v2 suite or record why it could not run and the residual
risk. Use `.codex/skills/neko-agent-evaluation/SKILL.md` to make one
`reuse | update | create | excluded` decision per affected behavior before
planning user behavior, canonical path, forbidden fallback, observable evidence,
coverage delta, and suite/case. Do not restore `neko eval`, create a second
orchestration path inside Neko Agent, or add runtime-only Evaluation switches.

The default development and acceptance order for new Agent features is: define
the shared contract, runtime path, and path-level tests first; validate Agent
core behavior, Skill/Tool/prompt effects, long-running tasks, failure
diagnostics, and stability through focused unit/contract tests and TUI debug
automation evaluation; then validate Webview UI projection, interactions, the
`invokeSkill` / active Skill indicator, and UI Skill behavior through VS Code
Extension Development Host plus the `vscode-extension-debugger` Skill. Webview
acceptance does not replace Agent/TUI core behavior validation, and TUI debug
automation evaluation does not replace VS Code Webview runtime acceptance.

```bash
pnpm test:agent:eval
node scripts/agent-eval/protocol-smoke.mjs \
  --suite skill.storyboard \
  --case canonical-two-shot-storyboard \
  --dry-run
```

`pnpm test:agent:eval` is a key-free harness test included in `pnpm ci:local`
and GitHub CI. It proves strict schemas, runner/protocol, reporting and failure
classification, plus all indexed suite dry-runs; it does not replace a real TUI
Agent case. Run the same `--suite` / `--case` command without `--dry-run` for the
real case. Conclusions must match assertion evaluators actually executed by the
current runner, canonical-path/no-fallback facts, effective model/config, and
artifact validators. Metadata, a zero exit code, a high Judge score, or a
non-empty final answer must not be described as complete scenario acceptance.

Default pull-request CI does not read provider secrets. Real focused/nightly
Evaluation runs only on trusted `main` pushes, schedules, or manual dispatch;
fork pull requests have no secret execution path. Raw reports are written to
gitignored `reports/agent-eval/`; developers clean local reports under the
14-day policy, while trusted-CI artifacts enforce 14-day retention. OpenSpec and
pull requests may reference only sanitized summaries:
suite/case/run, command, Host Skill identity/fingerprint or target hash,
provider/model/effective config, fixture digest, hard-gate/artifact evidence,
usage/cost availability, blockers, and residual risk. Do not commit credentials,
hidden prompts, raw provider configuration, absolute user paths,
cache/temp/runtime handles, or unauthorized content.

When credentials, network, provider/model access, and fixtures are available,
run the same focused case without `--dry-run`. If the real case or VS Code
debugger runtime cannot run, delivery notes must record the attempted command,
blocking condition, and residual risk. Mock-only, browser-only, jsdom-only,
direct-turn-injection-only, or final-text-only evidence does not replace TUI
debug automation evaluation or real VS Code Webview functional acceptance.

When changing `.github/workflows/ci.yml`, dependency installation, Corepack/pnpm, FFmpeg setup, or Linux runner shell logic, use `act` as a local GitHub Actions shape check:

```bash
pnpm ci:act:list         # List locally supported act jobs
pnpm ci:act              # Runs Linux-compatible jobs: build/test-ts/code-quality/cargo-deny
pnpm ci:act -- --verbose # Pass extra act args through
pnpm ci:act -- --reuse   # Example: reuse containers while debugging
```

`act` is a local preflight, not a replacement for GitHub Actions. The `Rust Tests` job uses `macos-latest` in CI, so run `pnpm ci:local:rust` locally and treat GitHub-hosted runners as the final signal.

Build, local CI, and TS VSIX release flows share extension package groups from `scripts/package-groups.json`. When adding or changing releasable extensions, dev-only extensions, or TS VSIX package lists, update that file first and then run the relevant scripts. This avoids duplicating package lists across `build.sh`, `ci.sh`, and GitHub Actions.

For integration smoke checks:

```bash
pnpm smoke:engine        # Engine CLI + serve /health + dispatch smoke
pnpm smoke:webview       # Builds all webview packages; limit with NEKO_WEBVIEW_SMOKE_PACKAGES
pnpm smoke:webview:targets
# Only proves VS Code page/Webview target discovery; it is not functional acceptance
pnpm smoke:vscode:targets -- --skill vscode-extension-debugger --require-webview
pnpm test:webview:functional:p0
# Runs P0 user operations, persistence, and error gates in isolated Extension Development Hosts
node scripts/smoke-webview-builds.mjs --list  # Lists selected webview packages without building
```

### Prelaunch Compatibility Policy

This project is still prelaunch, so changes may deliberately break unreleased internal APIs, DTOs, Webview messages, Agent workflow payloads, test fixtures, or `nk*` draft formats when doing so reduces long-term compatibility debt. The break must still be recorded in the proposal, design, tasks, or PR notes with the affected surface, the reason, and whether old data is migrated, rebuilt, reimported, ignored, or intentionally discarded.

New-path development should first define the smallest replacement boundary, then delete old compatibility shims, legacy adapters, fallback branches, dual-read/dual-write paths, old field mappings, and legacy command aliases inside that boundary and disconnect the old call chain. Confirm that the old path can no longer return success before defining the new design/contract, implementing the new canonical path, and wiring acceptance evidence. Do not keep fixing old-path defects or connect new features to parallel old/new paths while the legacy path can still fall back successfully. Disable compatibility fallback by default when testing the new path; if execution reaches a legacy path, it must throw, return a fail-closed diagnostic, or emit assertable telemetry/log failure instead of returning a legacy success result. Only migration, rejection, or diagnostic tests may intentionally observe the legacy path. New-path acceptance must be path-level acceptance, not result-only acceptance: tests must assert that the canonical path, new handler, new renderer, new adapter, or new contract was hit, and prove the legacy path did not participate through a spy, counter, log assertion, or poisoned legacy path that throws. Code defects must not be swallowed by fallback or compatibility logic: missing new implementations, contract mismatches, illegal states, unknown messages, bad configuration, or unregistered handlers/renderers/adapters should fail visibly instead of falling back to old implementations, empty data, success defaults, or no-ops. Keep compatibility logic only when it protects valuable local data, a published contract, or an external trust boundary, and give it an owner, replacement path, validation command, removal criteria, and expiry task. Prelaunch status also does not relax VS Code, Node, pnpm, Rust, OS, Webview sandbox, CSP, codec, Range, Engine, Proto, or marketplace trust boundaries, and it must not silently delete or corrupt valuable local project data, settings, trust state, entitlements, install records, or generated artifacts.

For the code review process, risk levels, functional/UX/performance checks, and merge rules, follow [AGENTS.md](./AGENTS.md) and the validation guidance in [ARCHITECTURE.md](./ARCHITECTURE.md).

### CI/CD

PRs and pushes to the main branch automatically trigger GitHub Actions CI (`.github/workflows/ci.yml`), with path-based filtering to run only relevant jobs:

| Job                   | Trigger                           | Contents                                                         |
| --------------------- | --------------------------------- | ---------------------------------------------------------------- |
| **Build & Lint**      | TS/config file changes            | `format:check` + `lint` + `build`                                |
| **TypeScript Tests**  | Same as above                     | `pnpm test --coverage` + coverage artifact                       |
| **Code Quality**      | Same as above                     | Knip dead code detection + dependency-cruiser architecture rules |
| **Rust Tests**        | `packages/neko-engine/**` changes | `cargo fmt --check` + `clippy` + `cargo test`                    |
| **Cargo Deny**        | Same as above                     | Rust dependency audit                                            |
| **Proto Types Sync**  | `packages/neko-proto/**` changes  | Verify generated types are in sync                               |
| **Dependency Review** | PRs only                          | Security dependency review                                       |

---

## Code Standards

For the repository-level working rules, see [AGENTS.md](./AGENTS.md). Key points below:

### TypeScript

- **Strict mode**: `strict: true` + `noUncheckedIndexedAccess: true` (configured in tsconfig.json)
- **Types first**: Define interfaces/types before implementing logic
- **No `any`**: Use `unknown` + type guards instead
- **No `console.log`**: Use the project Logger (`ILogger` from `@neko/shared`)
- **No type assertions**: Replace `as Type` with type guard functions

```typescript
// ❌ Prohibited
const data = response as MyType;
console.log(data);

// ✅ Correct
function isMyType(v: unknown): v is MyType { ... }
if (isMyType(data)) { logger.info('data', data); }
```

### Shared Infrastructure Usage

**Logger** (`@neko/shared`):

```typescript
// Extension Host
import { createVSCodeLogger } from '@neko/shared/vscode/extension';
const logger = createVSCodeLogger('MyExtension');
logger.info('message', { data });

// Webview
import { ConsoleLogger } from '@neko/shared';
const logger = new ConsoleLogger('MyWebview');
```

**i18n** (`@neko/shared`):

```typescript
// Extension Host
import { I18nService, getVSCodeLocale } from '@neko/shared/vscode/extension';
const i18n = new I18nService(getVSCodeLocale());
i18n.register('myNamespace', { key: 'value' });

// Webview (React)
import { I18nProvider, useTranslation } from '@neko/shared/i18n/react';
const { t } = useTranslation();
```

**EngineClient** (`@neko/neko-client`):

```typescript
// Get the engine port
const { port } = await vscode.commands.executeCommand<{ port: number }>(
  'neko.engine.ensureFrameServer',
);

// Create a client
import { EngineClient } from '@neko/neko-client';
const client = new EngineClient(port);

// Call engine features
const probeResult = await client.probe(filePath);
const waveform = await client.waveform(filePath, { width: 1000 });
```

### Webview Development Constraints

Webviews run in a sandbox and **cannot directly access Node.js or VS Code APIs**:

```typescript
// ❌ Prohibited in Webview
import fs from 'fs';
import * as vscode from 'vscode';

// ✅ Request via postMessage to Extension Host
vscode.postMessage({ type: 'readFile', path: '/path/to/file' });
```

### Naming Conventions

| Type           | Convention        | Example                        |
| -------------- | ----------------- | ------------------------------ |
| Interface      | `I` + Noun        | `IEncoder`, `IMediaService`    |
| Abstract class | `Abstract` + Noun | `AbstractRenderer`             |
| Implementation | Noun + Suffix     | `H264Encoder`, `WebGLRenderer` |
| Event          | `onDid` + Verb    | `onDidChangeState`             |

### File Organization

Code within a file is ordered by abstraction level: type definitions -> interfaces -> abstract classes -> concrete implementations -> utility functions -> exports.

### Rust

- Follow `cargo fmt` formatting
- New public APIs require doc comments (`///`)
- Avoid `unwrap()`: use `?` for error propagation or `expect("explicit reason")`

---

## Testing

```bash
# TypeScript unit tests (Vitest)
pnpm test

# Single package test
cd packages/neko-agent && pnpm test

# Rust tests
cd packages/neko-engine && cargo test

# Type-check only (no tests)
pnpm typecheck
```

**Testing requirements**:

- New public interfaces/services must have corresponding unit tests
- Core Rust algorithms must have unit tests (`#[cfg(test)]`)
- Complex Store Slice changes must have Vitest tests

---

## Submitting a PR

### Branch Naming

```
feature/neko-cut-export-presets
fix/neko-engine-audio-normalize
refactor/neko-types-error-handler
docs/update-architecture
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(neko-cut): add export preset management
fix(neko-engine): resolve audio normalize API missing route
refactor(neko-types): extract IErrorHandler to separate interface
docs: update ARCHITECTURE.md with streaming flow
```

**Types**: `feat` / `fix` / `refactor` / `perf` / `test` / `docs` / `chore`

### PR Checklist

- [ ] `pnpm build` passes
- [ ] `pnpm test` passes
- [ ] Rust changes: `cargo test` + `cargo clippy` pass
- [ ] New interfaces have unit tests
- [ ] New features that touch style, theme, i18n, logging, errors, file IO, cache, config, paths, or DTOs include a shared foundation audit
- [ ] New features that touch providers, registries, bridges, protocols, status/tree/history/selection, or similar reusable capabilities include a cross-package reuse audit
- [ ] New Webview/React components include a reuse audit and explain why existing components could not be enhanced or moved into `@neko/ui`
- [ ] New-path development first scopes the replacement and disconnects the old call chain; old compatibility logic is deleted, isolated, or fail-closed, and acceptance asserts the canonical path was hit while the legacy path did not participate or return success
- [ ] Architecture changes: corresponding ADR or package README updated
- [ ] No `any` types, no `console.log`, no `as Type` assertions

### Code Review Focus

1. Does it follow SOLID principles (single responsibility, dependency inversion)?
2. Does the Webview misuse Node.js/VS Code APIs?
3. Does it introduce circular dependencies?
4. Did cross-cutting behavior reuse or update shared foundations instead of adding package-local parallel systems?
5. Did reusable capability code check adjacent packages/shared layers and avoid copied implementations or direct imports of feature-package internals?
6. Did new components audit and prefer enhancing existing `@neko/ui` or package-local components?
7. Is complexity proportional to a local VSCode client plus local Rust Engine, avoiding cloud multi-tenant or distributed-service overdesign?
8. Does defensive code protect only real boundaries, avoiding broad try/catch, silent defaults, fallback, compatibility branches, or repeated validation that hides development errors?
9. For prelaunch refactors, did the change clean old successful paths and disconnect old call chains inside the target boundary before defining and wiring the new canonical path?
10. Does the Rust code have risky `unwrap()` calls?

---

## Priority Contribution Areas

Refer to [TODO.md](./TODO.md) for P0/P1 tasks. Below are the areas where help is most needed:

| Area                       | Required Skills          | Related Packages       |
| -------------------------- | ------------------------ | ---------------------- |
| GPU rendering optimization | Rust + wgpu + WGSL       | neko-engine            |
| Timeline Skills            | TypeScript + LLM API     | neko-agent             |
| LSP error diagnostics      | TypeScript + LSP         | neko-story             |
| Unit tests                 | Vitest / cargo test      | All packages           |
| Effects/Shader system      | Rust + WGSL + TypeScript | neko-engine + neko-cut |
| i18n translation           | Multilingual translation | All webview packages   |

**Current architecture references**:

- [ARCHITECTURE.md](./ARCHITECTURE.md) for stable system boundaries.
- [docs/README.md](./docs/README.md) for documentation categories and discovery paths.
- [TODO.md](./TODO.md) for active work.
- [ROADMAP.md](./ROADMAP.md) for directional product planning.

---

## Debugging Tips

**Extension Host logs**: `console.log('[MyExt]', data)` -> VS Code Output panel

**Webview debugging**: `Cmd+Shift+P -> Developer: Open Webview Developer Tools`

**Rust logs**: `tracing::info!("msg")` -> Output via neko-engine telemetry system

For repository-level debugging and working conventions, see [AGENTS.md](./AGENTS.md).

---

_Questions? Feel free to open an Issue for discussion, or @ a maintainer directly in your PR._
