## 1. Contract Replacement

- [x] 1.1 Update SubAgent tool contract tests to require `subagent`, `subagent_output`, and `subagent_id`, and to poison the removed `task`, `task_output`, and `task_id` path.
- [x] 1.2 Rename SubAgent argument types, tool registrations, schemas, descriptions, and result collection implementation to the canonical SubAgent-specific contract.
- [x] 1.3 Add fail-visible identifier-kind validation that rejects `task_...` before `SubAgentManager` lookup and preserves scoped not-found behavior for valid `subagent-...` IDs.

## 2. Repository Integration

- [x] 2.1 Migrate repository-owned callers, prompt/tool catalogs, fixtures, documentation, and tests to the canonical SubAgent names without compatibility aliases.
- [x] 2.2 Update image/video/music/TTS generation descriptions and tests to declare Host Task observation delivery and forbid SubAgent result lookup.
- [x] 2.3 Run focused SubAgent, tool-registry, media-tool, and affected integration tests plus typecheck/build for the changed packages.

## 3. Agent Evaluation and Quality

- [x] 3.1 Reuse, update, or create focused Evaluation cases proving canonical background SubAgent collection and forbidding SubAgent lookup after image generation; run key-free validation.
- [x] 3.2 Run the focused cases through the real TUI with DeepSeek and configured media provider, or record the exact external blocker and unverified behavior.
- [x] 3.3 Run `pnpm check:legacy-debt`, `pnpm check:unused`, applicable repository checks, `git diff --check`, and the Neko quality review; record verification and residual risk.
