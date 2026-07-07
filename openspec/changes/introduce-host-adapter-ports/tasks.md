## 1. Host Contract Foundation

- [x] 1.1 Create `packages/neko-host` as a workspace package with public exports and strict TypeScript config.
- [x] 1.2 Define primitive host contracts for environment, workspace, filesystem, paths, secrets, external opening, diagnostics, and access policy.
- [x] 1.3 Add architecture boundary tests proving `@neko/host` does not import concrete VSCode, Node, React, Agent, Engine client, Content, Entity, Search, or Webview implementations.
- [x] 1.4 Update architecture documentation to register `@neko/host` as a Layer 0 Host Adapter ports contract package.
- [x] 1.5 Add `@neko/host` to dependency-cruiser or equivalent package boundary checks if existing dependency checks do not cover the new package.

## 2. TUI Node Host Adapter

- [x] 2.1 Implement `NodeHostAdapter` under `packages/neko-agent/packages/cli-tui/src/host` using Node APIs only inside that adapter boundary.
- [x] 2.2 Implement workspace resolution for TUI workDir, storage layout, path variables, workspace trust, and `${A}`/workspace-relative path handling.
- [x] 2.3 Implement filesystem and path ports with containment checks and explicit diagnostics for missing, unauthorized, and unresolved paths.
- [x] 2.4 Implement access policy so `agent` actor cannot read, write, list, or delete `workspace/.neko` internals while `client` and `domain-runtime` actors can operate through owning runtimes.
- [x] 2.5 Add focused Node host adapter tests for workspace snapshots, path resolution/contraction, storage layout, and `.neko` access policy.

## 3. Skill Lifecycle Contract Fix

- [x] 3.1 Update TUI `wireCliSkillLifecycleSession` provider to accept structured `{ name, reason }` activation requests.
- [x] 3.2 Route `request.name` into `defaultSkillLifecycleRequest` and preserve `request.reason` in diagnostics or lifecycle metadata where supported.
- [x] 3.3 Add a regression test proving TUI `ActivateSkill` no longer passes the request object as `skillName` and no `.trim()` object crash occurs.

## 4. Content Capability Ownership

- [x] 4.1 Move or recreate `ReadDocument` and `ReadImage` capability factories at the content owning boundary without importing VSCode Extension internals or `@neko/agent` runtime implementation.
- [x] 4.2 Provide a content-domain capability provider that registers `ReadDocument` and `ReadImage` from host/runtime dependencies.
- [x] 4.3 Update VSCode Extension content capability registration to use the content-owned provider while preserving current behavior.
- [x] 4.4 Update TUI initialization paths to compose Node host ports with content runtime dependencies and register the same content provider.
- [x] 4.5 Add content tool tests proving `ReadDocument.imageInfo[].resourceRef` can be passed to `ReadImage` and path-only/cache/Webview URI inputs are rejected.

## 5. TUI Headless Domain Capabilities

- [x] 5.1 Add TUI provider registration tests proving `GetContext(includeTools)` can see `ReadDocument` and `ReadImage`.
- [x] 5.2 Add asset capability design/implementation for TUI using asset-owned runtime APIs and host ports, without Webview URI or extension-internal imports.
- [x] 5.3 Add entity/search capability design/implementation for TUI using owning runtimes and sanitized projections, without exposing `.neko` index/store files.
- [x] 5.4 Add tests proving Agent receives asset/entity/search projections and cannot access backing `.neko` files through generic file tools.
- [x] 5.5 Record deferred auth, market, and Engine headless capabilities with explicit owners if they are not implemented in this change.

## 6. Agent `.neko` Isolation And Mutation Policy

- [x] 6.1 Audit Agent generic file tools and input reference resolution for direct `.neko` access.
- [x] 6.2 Add fail-visible diagnostics for Agent attempts to read, write, list, or delete managed `.neko` internals.
- [x] 6.3 Replace direct Agent memory or workspace storage writes with proposal/client-domain mutation paths where needed.
- [x] 6.4 Add tests for `.neko/.cache`, `.neko/logs`, `.neko/tmp`, entity store, search index, and memory write boundaries.

## 7. Validation And Documentation

- [x] 7.1 Run `./node_modules/.bin/tsc --noEmit -p packages/neko-host/tsconfig.json`.
- [x] 7.2 Run `./node_modules/.bin/vitest run packages/neko-host/src/__tests__/architecture-boundaries.test.ts`.
- [x] 7.3 Run focused TUI tests for skill lifecycle, host adapter, capability loading, and content tool registration.
- [x] 7.4 Run focused content tests for document/image refs and cache-hidden behavior.
- [x] 7.5 Run `pnpm check:content-access-boundaries` and `pnpm check:agent-boundaries`, or record why narrower validation is sufficient. Direct content boundary script passed; direct agent boundary script ran and failed only on pre-existing expired compatibility exceptions dated 2026-07-04.
- [x] 7.6 Run `git diff --check` for the touched files.
- [x] 7.7 Update architecture or domain docs if asset/entity/search host adapter rules become stable during implementation.
