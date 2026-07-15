## Quality Review

- Risk: L3, because the change adds a user-facing direct media workflow and external provider execution path, while leaving Agent, Webview, Proto and Engine contracts unchanged.
- Architecture: CLI syntax remains in `apps/neko-tui`; direct orchestration uses a narrow injected runtime; Platform retains model routing/generation ownership; TaskManager retains lifecycle ownership; Node Host delivery retains generated-output and stable asset projection ownership.
- Reuse audit: reused `ConfigManager.getDefaultMediaModels`, `submitMediaTurn`, `createCLIPlatform`, SQLite Task storage, resource-cache generated asset index and `NodeMediaTaskDeliveryHost`. No package-local provider, cache, path, Task or generated-asset implementation was added.
- Findings: no remaining blocking findings. The initially proposed `--detach` path was removed because the local CLI has no durable background-process owner and could not guarantee execution after process exit.

## Verification

- `pnpm --filter @neko/app-tui test`: passed, 95 files / 584 tests.
- Focused direct media tests: passed, 4 files / 18 tests; cover three media kinds, model identity, wrong-category rejection, Task failure, stable-result rejection, poisoned Agent TUI routing and architecture boundaries.
- `pnpm --filter @neko/app-tui build`: passed.
- `node apps/neko-tui/dist/main.js image|video|audio --help`: passed; flat commands expose `--model` and `--json` with no `generate`, music/TTS or detach layer.
- `openspec validate add-direct-media-cli-commands --strict`: passed.
- `git diff --check -- apps/neko-tui openspec/changes/add-direct-media-cli-commands`: passed.
- `pnpm --filter @neko/app-tui typecheck`: executed but blocked by pre-existing parallel-worktree errors in existing TUI tests and shared Agent/Platform packages; no diagnostic referenced a new direct-media source file, and the package bundle build passed.
- `pnpm check:legacy-debt`: executed and failed on the existing repository baseline (140 blocking occurrences); no new direct-media source match was reported.
- `pnpm check:unused`: executed and failed on the existing repository baseline (unused Home files/dependencies and 81 unused exports); no new direct-media file or export was reported.

## Evaluation

- Disposition: excluded from real Agent Evaluation because the canonical feature path forbids AgentSession, prompt, Skill and Tool routing.
- Deterministic no-fallback evidence: CLI action tests poison Ink/Agent TUI rendering; architecture tests reject AgentSession/runtime execution APIs; failed media operations remain direct-command failures.
- Real provider cases: not run because configured credentials/model access are unavailable and generation may incur external cost.

## Residual Risk

- A credentialed smoke run is still needed to validate a real image, video and audio provider submission plus generated-output download on this machine.
- Full repository typecheck, legacy-debt and unused gates remain red because of unrelated concurrent workspace changes/baseline debt; the scoped package tests and build are green.
