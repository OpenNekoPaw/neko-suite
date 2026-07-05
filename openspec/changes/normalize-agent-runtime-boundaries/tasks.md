## 1. Runtime Boundary Audit

- [x] 1.1 Inventory every file under `packages/neko-agent/packages/agent/src/runtime` and classify it as session runtime, runner, turn, capability, stream, or non-runtime owner.
- [x] 1.2 Record the target owner for each non-runtime runtime-root file, preferring existing directories before proposing new directories.
- [x] 1.3 Identify any import paths that need transitional re-exports and document each re-export with a removal condition.

## 2. Boundary Documentation

- [x] 2.1 Update `packages/neko-agent/packages/agent/src/runtime/index.ts` or add `runtime/README.md` with allowed runtime categories and disallowed owner categories.
- [x] 2.2 Document the semantic differences between runner, turn, ReAct, session, context, memory, and Agent capability consumption.
- [x] 2.3 Document that runtime bootstrap planes are projection helpers, not lifecycle, permission, tool-policy, prompt, or activation-progress governance.

## 3. Architecture Guards

- [x] 3.1 Extend `packages/neko-agent/packages/agent/src/__tests__/architecture-boundary-guards.test.ts` so runtime collaborators remain independent from VSCode, React, Webview, and Extension imports.
- [x] 3.2 Add runtime-root guard coverage for new `*-presenter.ts`, `*-projector.ts`, broad `*-service.ts`, and `*-store.ts` files unless explicitly allowlisted as transitional.
- [x] 3.3 Add guard coverage for allowed runtime subdirectories and require documentation/test updates when a new runtime subdomain is introduced.
- [x] 3.4 Keep or extend existing guards that prevent domain creative runtimes and concrete operation adapters from entering Agent runtime ownership.

## 4. Existing Owner Moves

- [x] 4.1 Move artifact persistence concerns such as `artifact-service` and `node-artifact-store` into the existing artifact/workspace owner area selected by the audit.
- [x] 4.2 Move attachment/resource projection helpers into the selected input/message/content owner area.
- [x] 4.3 Move context/conversation Webview presenter helpers into the selected host-message/session/command owner area or document why they remain as transitional exceptions.
- [x] 4.4 Update tests and imports for each moved owner slice without changing Agent behavior.

## 5. Runtime Subdomain Moves

- [x] 5.1 Create only the runtime subdirectories needed by the audit, such as `runtime/session`, `runtime/runner`, `runtime/turn`, `runtime/capability`, or `runtime/stream`.
- [x] 5.2 Move runner contracts and session-runner code into the runner subdomain while preserving public exports.
- [x] 5.3 Move turn orchestration code into the turn subdomain or a documented equivalent message/turn owner.
- [x] 5.4 Move Agent capability registry, binding, refresh, injection, and lifecycle consumption code into the capability subdomain while keeping shared provider contracts in `@neko/shared`.
- [x] 5.5 Move stream runtime helpers into the stream subdomain if the audit confirms they are still Agent-runtime-owned.

## 6. Validation

- [x] 6.1 Run focused Agent runtime/session/turn/capability tests affected by the moved files.
- [x] 6.2 Run the architecture boundary guard test suite for `packages/neko-agent/packages/agent`.
- [x] 6.3 Run the package TypeScript/build/check command needed to prove imports and barrels are valid.
- [x] 6.4 Record residual risk if Webview messages or UI are touched; otherwise document that VSCode Webview smoke was not required because behavior did not change.
- [x] 6.5 Remove completed transitional re-exports or leave explicit follow-up tasks with owner, validation command, and removal condition.

## Validation Notes

- Focused runtime/owner tests passed: `./node_modules/.bin/vitest --run <37 affected test files>` from `packages/neko-agent` reported 37 files and 346 tests passed.
- Architecture boundary guard passed: `./node_modules/.bin/vitest --run packages/agent/src/__tests__/architecture-boundary-guards.test.ts` from `packages/neko-agent` reported 43 tests passed.
- Runtime public barrel import passed: `./node_modules/.bin/tsx -e "import('./src/runtime/index.ts').then(() => console.log('runtime barrel import ok'))"` from `packages/neko-agent/packages/agent`.
- Full package `tsc --noEmit --pretty false` was run from `packages/neko-agent/packages/agent`; it still exits 2 because of existing test type debt, but the filtered output did not show moved-path `Cannot find module` or missing-export errors for this change.
- No Webview messages or UI behavior changed; VSCode Webview smoke was not required.
- No runtime-root transitional shim files remain. `runtime/index.ts` intentionally remains the public package barrel.
