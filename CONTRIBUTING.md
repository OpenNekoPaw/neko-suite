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

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 20 | LTS recommended |
| pnpm | >= 10 | `npm i -g pnpm` |
| Rust | stable (>= 1.75) | `rustup toolchain install stable` |
| VS Code | >= 1.85 | Target host environment |

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

# 6. Install to VS Code (dev mode)
./install.sh
```

### Selective Installation (Recommended)

Neko Suite supports installing subsets of extensions by scenario, without installing everything at once:

```bash
# Scenario packs (automatically include core infrastructure)
./install.sh --pack video     # AIGC Video: core + cut + canvas + story (10 extensions)
./install.sh --pack 2d        # 2D Creation: core + sketch (8 extensions)
./install.sh --pack audio     # Audio Editing: core + audio (8 extensions)

# Stacking packs
./install.sh --pack video --pack 2d   # Video + 2D (shared extensions not duplicated)

# Full installation (release-ready)
./install.sh --all            # All release-ready extensions

# Dev mode (includes unfinished modules)
./install.sh --dev            # Includes neko-live, neko-model
```

| Pack | Included Extensions | Use Case |
|------|--------------------|----------|
| **neko-suite-core** | engine + tools + preview + assets + auth + agent + market | Infrastructure + AI (auto-dependency) |
| **neko-suite-video** | core + cut + canvas + story | Assets -> Script -> Storyboard -> Video |
| **neko-suite-2d** | core + sketch | Painting + Puppet + AI-assisted |
| **neko-suite-audio** | core + audio | Waveform editing + Effect chains |
| **neko-suite** | All | Full-stack creation |

See the [Extension Pack Layering Strategy ADR](./docs/architecture/extension-pack-strategy.md) for details.

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
├── docs/                # Architecture Decision Records (ADR)
├── ARCHITECTURE.md      # System architecture overview
├── CLAUDE.md            # AI development guidelines (must-read)
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
```

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

| Rule | Severity | Description | Status |
|------|----------|-------------|--------|
| `no-circular` | error | No circular dependencies | 0 violations |
| `layer0-no-internal-deps` | error | Layer 0 (@neko/shared, @neko/neko-client) must not depend on other internal packages | Passing |
| `webview-no-vscode` | error | Webview packages must not import the `vscode` module | Passing |
| `extension-no-react` | error | Extension packages must not import React/ReactDOM | Passing |
| `no-cross-extension-deps-*` | warn | Extension packages must not depend on each other directly | Passing |

**Common circular dependency patterns and fixes**:

| Pattern | Example | Fix |
|---------|---------|-----|
| **Barrel re-import** | `index.ts` defines interface -> impl imports from `./index` -> `index.ts` imports impl | Move interfaces to `types.ts`; both sides import from `types.ts` |
| **Hook/Service cross-reference** | Service depends on utility in Hook -> Hook depends on Service via barrel | Extract utilities to a standalone `utils/` module |
| **Inline `import()` types** | `types.ts` uses `import('./impl').Class` to reference impl class | Define interface in `types.ts` (dependency inversion); impl class `implements` that interface |

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

### Local CI Checks

Before opening a PR, run the local CI-equivalent checks that match the impact area:

```bash
pnpm ci:local            # General TS/Webview/Extension quality gate
pnpm ci:local:rust       # Rust engine changes
pnpm ci:local:proto      # Proto contract and generated type sync
```

For integration smoke checks:

```bash
pnpm smoke:engine        # Engine CLI + serve /health + dispatch smoke
pnpm smoke:webview       # Builds all webview packages; limit with NEKO_WEBVIEW_SMOKE_PACKAGES
node scripts/smoke-webview-builds.mjs --list  # Lists selected webview packages without building
```

For the code review process, risk levels, functional/UX/performance checks, professional software comparison, and merge rules, see [Code Review and Quality Gates ADR](./docs/architecture/adr-code-review-quality-gates.md).

### CI/CD

PRs and pushes to the main branch automatically trigger GitHub Actions CI (`.github/workflows/ci.yml`), with path-based filtering to run only relevant jobs:

| Job | Trigger | Contents |
|-----|---------|----------|
| **Build & Lint** | TS/config file changes | `format:check` + `lint` + `build` |
| **TypeScript Tests** | Same as above | `pnpm test --coverage` + coverage artifact |
| **Code Quality** | Same as above | Knip dead code detection + dependency-cruiser architecture rules |
| **Rust Tests** | `packages/neko-engine/**` changes | `cargo fmt --check` + `clippy` + `cargo test` |
| **Cargo Deny** | Same as above | Rust dependency audit |
| **Proto Types Sync** | `packages/neko-proto/**` changes | Verify generated types are in sync |
| **Dependency Review** | PRs only | Security dependency review |

---

## Code Standards

For the full specification, see [CLAUDE.md](./CLAUDE.md). Key points below:

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
i18n.register('myNamespace', { 'key': 'value' });

// Webview (React)
import { I18nProvider, useTranslation } from '@neko/shared/i18n/react';
const { t } = useTranslation();
```

**EngineClient** (`@neko/neko-client`):
```typescript
// Get the engine port
const { port } = await vscode.commands.executeCommand<{ port: number }>(
  'neko.engine.ensureFrameServer'
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

| Type | Convention | Example |
|------|-----------|---------|
| Interface | `I` + Noun | `IEncoder`, `IMediaService` |
| Abstract class | `Abstract` + Noun | `AbstractRenderer` |
| Implementation | Noun + Suffix | `H264Encoder`, `WebGLRenderer` |
| Event | `onDid` + Verb | `onDidChangeState` |

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
- [ ] Architecture changes: corresponding ADR or package README updated
- [ ] No `any` types, no `console.log`, no `as Type` assertions

### Code Review Focus

1. Does it follow SOLID principles (single responsibility, dependency inversion)?
2. Does the Webview misuse Node.js/VS Code APIs?
3. Does it introduce circular dependencies?
4. Does the Rust code have risky `unwrap()` calls?

---

## Priority Contribution Areas

Refer to [TODO.md](./TODO.md) for P0/P1 tasks. Below are the areas where help is most needed:

| Area | Required Skills | Related Packages |
|------|----------------|-----------------|
| GPU rendering optimization | Rust + wgpu + WGSL | neko-engine |
| Timeline Skills | TypeScript + LLM API | neko-agent |
| LSP error diagnostics | TypeScript + LSP | neko-story |
| Unit tests | Vitest / cargo test | All packages |
| Effects/Shader system | Rust + WGSL + TypeScript | neko-engine + neko-cut |
| i18n translation | Multilingual translation | All webview packages |

**Recently completed architecture improvements** (good learning references):
- AI Agent architecture refactor (`docs/plans/2026-03-10-neko-agent-skill-tool-refactor-design.md`): ToolSet/Skill/Hook subsystem rename cleanup, Shell hooks bridge, two-tier tool injection (`always`/`dynamic`)
- Unified engine architecture (`docs/adr-unified-engine.md`)
- Cross-cutting concerns unification (`docs/architecture/adr-cross-cutting-concerns.md`)
- Shader/Effects full pipeline (`packages/neko-engine/packages/engine-kernel/src/export/gpu_export_pipeline.rs`)

---

## Debugging Tips

**Extension Host logs**: `console.log('[MyExt]', data)` -> VS Code Output panel

**Webview debugging**: `Cmd+Shift+P -> Developer: Open Webview Developer Tools`

**Rust logs**: `tracing::info!("msg")` -> Output via neko-engine telemetry system

For detailed debugging methods, see [CLAUDE.md](./CLAUDE.md).

---

*Questions? Feel free to open an Issue for discussion, or @ a maintainer directly in your PR.*
