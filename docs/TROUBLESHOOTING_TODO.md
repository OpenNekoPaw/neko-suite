# Troubleshooting Remaining TODO

Last updated: 2026-04-08
Source: `docs/TROUBLESHOOTING.md`

## Summary

| Status | Count | Percentage |
|--------|-------|-----------|
| fixed | 61 | 73% |
| verified | 4 | 5% |
| deferred | 3 | 4% |
| **open** | **16** | **18%** |
| **Total** | **84** | |

All P0 issues cleared. No user-visible functionality regressions remain.

---

## P1 — Needs Action (4 items)

### NKC-010: neko-cut extension protocol test coverage (partial)

**Status**: Has command registration + asset routing + AI handler tests. Missing: dirty event round-trip.

**What to do**: Add `operationApplied` → `_onDidChangeCustomDocument.fire()` integration test. Requires mock `CustomTextEditorProvider` lifecycle.

**Files**: `packages/neko-cut/packages/extension/src/__tests__/protocol.test.ts`

### NKM-008: neko-market install orchestration test + existing test failures

**Status**: Has DTO source contract + InstalledRegistry.ready() tests. Missing: InstallManager round-trip. Existing `market-api.test.ts` has 14 failures (vscode mock issue).

**What to do**:
1. Fix `market-api.test.ts` vscode mock (line 36 uses `require('vscode')` instead of `vi.mock`)
2. Fix `ModelInstallTarget.test.ts` assertion mismatches
3. Add InstallManager.install() test covering download → verify → extract → register flow

**Files**: `packages/neko-market/packages/extension/src/__tests__/`

### NKAS-003: AssetRegistry multi-source merge not connected

**Status**: `AssetRegistry` class exists in `packages/neko-assets/packages/asset/src/service/` but is not imported or used by the main extension.

**Decision needed**: 
- A) Connect AssetRegistry to main extension pipeline
- B) Remove unused code and downscale documentation claims
- C) Defer to Phase 2 asset management roadmap

### NKAS-004: Non-media asset persistence

**Status**: AssetRegistry only holds non-media assets in memory. No persistence to disk, no consumers.

**Decision needed**: Same as NKAS-003 — coupled decision.

---

## P2 — Engineering Debt (10 items)

### Code Cleanup

| ID | Package | Task | Effort |
|----|---------|------|--------|
| NKC-009 | neko-cut | Remove dead/unwired execution paths in extension | Medium |
| NKS-010 | neko-story | Replace `!` non-null assertions with type guards | Low |
| NKAS-005 | neko-assets | Split 1200+ LOC `extension.ts` into modules | High |
| NKAS-006 | neko-assets | Multi-root workspace: use selection strategy instead of always-first | Low |

### i18n / Theme Unification

| ID | Package | Task | Effort |
|----|---------|------|--------|
| NKS-008 | neko-story | Migrate hardcoded Chinese/English strings to i18n bundles | Medium |
| NKUN-004 | neko-tools, neko-live, neko-story | Replace hand-written CSS token mapping with unified theme system | Medium |

### Cross-Package Architecture

| ID | Scope | Task | Effort |
|----|-------|------|--------|
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

| ID | Package | Issue | Decision |
|----|---------|-------|----------|
| NKS-006 | neko-story | `generateStoryboard` is a "Coming soon" stub | Implement or remove |
| NKM-006 | neko-market | Paid/private asset license verification is stub | Implement business logic or document limitation |
| NKAT-004 | neko-auth | Cloud provider token API returns null (Phase 2) | Implement when cloud integration is prioritized |

---

## Suggested Execution Order

1. **Quick wins** (1-2h): NKS-010, NKUN-008, NKP-008
2. **NKM-008 test fixes** (2-3h): Fix existing market test failures, add install orchestration test
3. **NKC-010 dirty event** (1h): Add operationApplied integration test
4. **i18n migration** (half day): NKS-008 hardcoded strings
5. **Architecture decisions**: NKAS-003/004 — schedule product discussion
6. **Large refactors** (multi-day): NKAS-005 extension.ts split, NKS-007 incremental index
7. **Cross-package unification**: NKUN-004/006/007 — plan as Sprint
