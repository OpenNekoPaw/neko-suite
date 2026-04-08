# Troubleshooting Remaining TODO

Last updated: 2026-04-08
Source: `docs/TROUBLESHOOTING.md`

## Summary

| Status | Count | Percentage |
|--------|-------|-----------|
| fixed | 62 | 74% |
| verified | 4 | 5% |
| deferred | 3 | 4% |
| **open** | **15** | **18%** |
| **Total** | **84** | |

All P0 issues cleared. All P1 functional defects resolved. Remaining P1 items are test coverage gaps and architectural decisions.

---

## P1 — Needs Action (4 items)

### NKC-010: neko-cut extension protocol test coverage (partial)

**Current state**: Has command registration tests (vi.hoisted Map verifies 20+ commands), asset routing tests (real isAssetMessage + handleAssetMessage), AI handler tests (real AIActionHandler → aiActionStatus). Missing: operationApplied → dirty event round-trip.

**What to do**: Mock CustomTextEditorProvider lifecycle, simulate operationApplied message, verify `_onDidChangeCustomDocument.fire()`.

### NKM-008: neko-market install orchestration test + existing test failures

**Current state**: Has DTO source contract + InstalledRegistry.ready() tests. Existing `market-api.test.ts` has failures (vscode mock issue). `ModelInstallTarget.test.ts` assertions outdated.

**What to do**:
1. Fix `market-api.test.ts` vscode mock (replace `require('vscode')` with `vi.mock`)
2. Fix `ModelInstallTarget.test.ts` assertion mismatches
3. Add InstallManager.install() test: download → verify → extract → register

### NKAS-003: AssetRegistry multi-source merge (product decision: keep)

**Decision**: Keep. AssetRegistry is production-ready code (307 lines, strategy pattern). Currently no consumers — awaiting Phase 2 asset management roadmap to determine integration path.

### NKAS-004: Non-media asset persistence (product decision: keep)

**Decision**: Keep. Coupled with NKAS-003 — persistence strategy depends on whether AssetRegistry gets connected to the main pipeline.

---

## P2 — Engineering Debt (9 items)

### Code Cleanup

| ID | Package | Task | Effort |
|----|---------|------|--------|
| NKC-009 | neko-cut | Remove dead/unwired execution paths in extension | Medium |
| NKS-010 | neko-story | Replace `!` non-null assertions with type guards | Low |
| NKAS-005 | neko-assets | Split 1200+ LOC `extension.ts` into modules | High |
| NKAS-006 | neko-assets | Multi-root workspace: use selection strategy instead of always-first | Low |

### Cross-Package Architecture

| ID | Scope | Task | Effort |
|----|-------|------|--------|
| NKUN-004 | neko-tools, neko-live, neko-story | Replace hand-written CSS token mapping with unified theme system | Medium |
| NKUN-006 | 4+ packages | Unify AI menu/interface builder adoption across packages | Medium |
| NKUN-007 | neko-agent, shared | Decide if Shell/tools capabilities should be promoted to shared layer | Architecture discussion |
| NKUN-008 | neko-tools | Fix README claiming ErrorBoundary integration that doesn't exist | Low |

### Performance

| ID | Package | Task | Effort |
|----|---------|------|--------|
| NKS-007 | neko-story | Replace full-rebuild workspace index with incremental updates | Medium-High |

---

## P3 — Low Priority Maintenance (2 items)

| ID | Package | Task | Effort |
|----|---------|------|--------|
| NKA-008 | neko-agent | Clean up build scripts: mixed shell/node, large files, hardcoded TODOs | Low |
| NKP-008 | neko-preview | Remove duplicate AudioPlayer unmount cleanup logic | Low |

---

## Deferred — Needs Product Decision (3 items)

| ID | Package | Issue | Status |
|----|---------|-------|--------|
| NKS-006 | neko-story | `generateStoryboard` placeholder command | Keep — awaiting storyboard feature roadmap |
| NKM-006 | neko-market | Paid/private asset license verification stub | Keep — intentional gate, blocks unsupported asset types |
| NKAT-004 | neko-auth | Cloud token API (getCloudToken) | Redesign planned — SSO exchange + user custom tokens (see analysis) |

---

## Suggested Execution Order

1. **Quick wins** (1h): NKUN-008 (fix README), NKS-010 (non-null assertions)
2. **NKM-008 test fixes** (2-3h): Fix existing market test failures, add install orchestration test
3. **NKC-010 dirty event** (1h): Add operationApplied integration test
4. **Large refactors** (multi-day): NKAS-005 extension.ts split, NKS-007 incremental index
5. **Cross-package unification**: NKUN-004/006/007 — plan as Sprint
