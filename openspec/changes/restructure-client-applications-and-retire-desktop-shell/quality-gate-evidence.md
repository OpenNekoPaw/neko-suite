# Client application restructuring quality-gate evidence

Date: 2026-07-14

## Canonical and retired product roots

- Present canonical roots: `apps/neko-home`, `apps/neko-tui`, and `apps/neko-vscode`.
- Removed roots: `packages/neko-desktop`, `packages/neko-agent/packages/cli-tui`, and `packages/neko-suite`.
- `packages/neko-workbench-core` remains a shared L0 contract owner and is not an application product root.
- Application boundary scanning passed across 4,470 checked files and rejects restored Desktop, Studio, `@neko/cli`, package-local TUI, and package-local Extension Pack paths.

Removing repository source did not delete user data. Project files, conversations, settings, credentials, trust state, installed packages, and generated artifacts remain owned by their canonical storage/domain services. Only source roots and rebuildable `dist`, cache, coverage, report, and VSIX outputs are classified for removal or regeneration. The detailed category policy remains in `docs/status/migration/2026-07-14-client-application-inventory.md`.

## Focused canonical application evidence

| Validation                                                                            | Result                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @neko/app-tui test`                                                    | Passed: 91 files, 566 tests.                                                                                                                                                       |
| `pnpm --filter @neko/app-tui test:sqlite:bun`                                         | Passed: 1 file, 4 tests.                                                                                                                                                           |
| `pnpm --filter @neko/app-tui build`                                                   | Passed; canonical executable is `apps/neko-tui/dist/main.js`.                                                                                                                      |
| `pnpm --filter @neko/app-tui typecheck`                                               | Exited 2 because workspace source aliases include current shared Agent, AI SDK, Platform, test-utils, and Shared strict-type failures; no diagnostic is under `apps/neko-tui/src`. |
| `pnpm exec knip --workspace apps/neko-tui --include exports,files,dependencies`       | Passed with no TUI findings.                                                                                                                                                       |
| `pnpm exec prettier --check "apps/neko-tui/src/**/*.{ts,tsx,json}"`                   | Passed.                                                                                                                                                                            |
| `node scripts/check-application-boundaries.mjs`                                       | Passed with no findings.                                                                                                                                                           |
| `pnpm test:agent:eval`                                                                | Passed: 39 files, 263 tests; strict discovery validated 26 suites and 38 cases. This is key-free harness evidence, not real Agent acceptance.                                      |
| `pnpm --dir apps/neko-vscode test`                                                    | Passed: 3 manifest/identity tests.                                                                                                                                                 |
| `pnpm --dir apps/neko-vscode package` plus `test:vsix`                                | Passed; regenerated `apps/neko-vscode/neko-suite-0.0.1.vsix` contains the canonical pure Extension Pack manifest.                                                                  |
| `openspec validate restructure-client-applications-and-retire-desktop-shell --strict` | Passed.                                                                                                                                                                            |
| `git diff --check`                                                                    | Passed.                                                                                                                                                                            |

Real TUI Agent runs and assertion-level outcomes are recorded in `tui-evaluation-evidence.md`. The full-source relocation passed cancel/resume and exact builtin Skill injection. Queue ordering and terminal assertions passed but queue drain failed because one item remained; task/artifact/ReadImage/continuation identity passed but generated-source multimodal projection and the final answer failed. These behavior failures were retained and were not retried into success.

## Repository-wide task 7.4 results

| Command                  | Result and blocker                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check:legacy-debt` | Failed with 130 blocking occurrences: 119 `migrate-now` and 11 `needs-review`. The scan has no `delete-now` occurrence; remaining findings span existing storage migrations, compatibility boundaries, Home, Agent, Shared, Canvas, UI, and TUI terminology. |
| `pnpm check:unused`      | Failed on repository-wide debt: 3 unused Home files, 6 unused dependencies, 5 unlisted dependencies, 110 unused exports, 1 duplicate export, and configuration hints. The focused TUI Knip gate passes.                                                      |
| `pnpm build`             | Passed: 33/33 Turbo tasks.                                                                                                                                                                                                                                   |
| `pnpm test`              | Failed in the shared `@neko/agent` architecture boundary guard because `_executionToolRegistry` is not in the allowed `AgentSession` field contract. Before Turbo stopped, TUI passed all 566 tests.                                                         |
| `pnpm check`             | Failed at its initial `check:unused` stage with the same repository-wide Knip findings; `check:deps` was not reached.                                                                                                                                        |
| `pnpm ci:local`          | Failed at `format:check`: 236 files under `packages/*` are not formatted. Later lint/build/test/repository-quality stages were not reached in this run.                                                                                                      |

The repository-wide failures are recorded as visible blockers. They were not fixed from this change because the worktree contains concurrent Home, Agent runtime, capability, Webview, Shared, and domain-package changes with separate owners.

## Remaining work and risk

- Home tasks 3.5, 3.9, and 3.10 remain open: AIGC lifecycle composition, deterministic instance isolation/stale identity coverage, and real Electron multi-session/AIGC scenarios.
- Task 7.5 remains open until those Home acceptance paths and the final archive record can be completed.
- The two real TUI behavior failures above remain release risks even though the source relocation and forbidden-old-path evidence are complete.
- Remote GitHub CI was not run. Local CI currently stops at the repository formatting blocker.
- This change must not be archived while the remaining Home tasks and final record are open.
