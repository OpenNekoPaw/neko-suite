## M1 Pilot Evidence

Run date: 2026-07-13

### Key-free harness

- Command: `pnpm test:agent:eval`
- Result: 10 files, 84 tests passed before the real pilot.
- Coverage: strict v2 contracts, change selector, suite discovery, fixture isolation,
  canonical driver cleanup, M1 hard gates, report generation, positive/negative v2
  orchestration, v1 metadata-only Judge rejection, and unsupported-field rejection.
- This is harness evidence only, not Agent behavior acceptance.

### Real provider-backed TUI pilot

- Command: `node scripts/agent-eval/protocol-smoke.mjs --suite
  agent-runtime.single-message-tui --case canonical-answer --run-id run-m1-real`
- Canonical path: TUI debug automation created the real TUI App/session owner, submitted
  the user message through the input queue, waited for full idle, read facts, and
  disposed the session.
- Actual model: `nekoapi-chat/gpt-5.5`.
- Outcome: `case-fail`.
- Passed hard gates: fully idle, canonical user-to-assistant turn, non-empty final
  answer.
- Failed hard gate: runtime errors empty. The conversation index runtime reported two
  `JSON Parse error: Unexpected EOF` diagnostics while loading/saving its index.
- Evidence: `reports/agent-eval/agent-runtime.single-message-tui/canonical-answer/
  run-m1-real/` (gitignored local report).
- Redaction check: no absolute user path, credential field, hidden prompt, or raw
  provider configuration was found in the generated report set.

### Residual risk

- A real provider/model response completed, but M1 acceptance remains failed until the
  conversation index corruption path is diagnosed and the runtime-error gate passes.
- The pilot is one sample and M1 intentionally skips Judge and baseline comparison.
- Usage/cost facts are not yet projected by TUI, so the report records latency and zero
  runner retries but cannot claim token or cost completeness.
