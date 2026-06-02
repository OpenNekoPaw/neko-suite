---
name: neko-quality-review
description: Use after non-trivial code changes in Neko Suite, when reviewing PRs, or when asked to run a repository quality review. Applies the Neko code review and quality gates ADR to classify risk, inspect architecture boundaries, choose validation commands, and produce review findings with verification and residual risk.
---

# Neko Quality Review

Use this skill after implementing or modifying code in this repository, and whenever the user asks for code review, quality review, PR readiness, CI readiness, UX/performance review, or architecture gate checks.

Source of truth:

- `docs/architecture/adr-code-review-quality-gates.md`
- `AGENTS.md`
- `ARCHITECTURE_CN.md`
- `CONTRIBUTING_CN.md` / `CONTRIBUTING.md`

## Workflow

1. Inspect the change set:

   ```bash
   git diff --name-only
   git diff --stat
   ```

2. Classify risk:
   - `L0`: docs, copy, low-risk single-file fix.
   - `L1`: local component, hook, service, or state logic.
   - `L2`: Webview/Extension messaging, shared packages, `EngineClient`, imports/exports, public types.
   - `L3`: Rust engine, Proto, media streams, rendering, project formats, AI workflow, packaging.
   - `L4`: release, install/packaging, major UX, core creative workflow.

3. Review architecture before implementation details:
   - Does it fit the existing architecture?
   - How does it reduce coupling?
   - Is it easy to extend and test?

4. For multi-module changes or new functionality, apply the five-layer analysis:
   - Responsibility: who owns data, behavior, and lifecycle?
   - Dependency: are L0/L1/L2 and Webview/Extension/Rust boundaries respected?
   - Interface: are types, messages, schemas, and Proto contracts minimal and stable?
   - Extension: will the next similar feature avoid broad edits or duplication?
   - Testing: what is covered by unit, integration, CLI smoke, or VSCode smoke?

5. Run or recommend validation by impact:

   ```bash
   pnpm ci:local
   ```

   For Rust changes:

   ```bash
   pnpm ci:local:rust
   ```

   For Proto changes:

   ```bash
   pnpm ci:local:proto
   ```

   If a narrower package command is enough, prefer the smallest reliable command and state why.

   For integration smoke checks:

   ```bash
   pnpm smoke:engine
   pnpm smoke:webview
   ```

## Review Checklist

Always check:

- No new production `any`, unsafe `as Type`, or formal logging via `console.log`.
- No circular dependency or broken layer direction.
- Webview code does not import `vscode`.
- Extension host code does not import React/ReactDOM.
- TypeScript does not duplicate Rust engine authoritative computation.
- Paths are relative or `${VAR}/path`, not hard-coded absolute paths.
- Async flows handle errors, cancellation, resource disposal, and races.
- Public contracts include tests or clear validation evidence.
- Docs are updated when behavior, architecture, config, package entry points, or public contracts change.

Add domain checks as needed:

- Webview/UX: layout, theme, focus, keyboard, i18n, screenshot or VSCode smoke evidence.
- Engine/media: `cargo test`, CLI smoke, `serve` integration, performance before/after when relevant.
- Proto/shared: generated types are synchronized and callers are migrated.
- Agent/AI: tool contracts, permissions, Journal/traceability, failure recovery.
- Assets/market: manifest/schema compatibility, path safety, cache invalidation, trust boundaries.

## Output Format

For review findings, lead with issues:

```text
Findings
- Blocking: [file:line] Problem. Impact. Suggested fix.
- Suggestion: [file:line] Problem. Impact. Suggested fix.

Verification
- Ran: ...
- Not run: ... (reason)

Residual Risk
- ...
```

If there are no findings, say so clearly and still report test gaps or residual risk.

For post-implementation self-review, summarize:

- Risk level and affected areas.
- Key architecture/contract decisions.
- Validation performed.
- Remaining follow-up, especially engine CLI smoke, `serve` integration, Webview smoke, UX evidence, or performance baselines.
