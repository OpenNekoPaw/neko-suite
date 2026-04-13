# neko-suite Package Audit & AI Capability Alignment Report

> **Date**: 2026-04-13
> **Scope**: neko-agent, neko-canvas, neko-cut, neko-preview, neko-story + cross-package AI alignment

---

## 1. neko-agent (AI Hub)

**Architecture Health: ★★★★☆**

Core architecture is clean: 5 sub-packages with unidirectional dependency (webview → extension → agent → platform → @neko/shared), ReAct execution loop, tiered tool loading (resident/eager/lazy), 13 built-in Skills, 10 media adapters (Runway/Luma/Suno/MiniMax/Midjourney etc.).

### Issues

| Severity | Issue | Location |
|----------|-------|----------|
| **High** | `disposeSkillFileService()` / `disposePromptFileService()` FileSystemWatcher **never called**, extension `deactivate()` is essentially empty | `SkillFileService.ts:887`, `index.ts:933` |
| **High** | `puppetFaceTools.ts` **fully duplicates** `neko-puppet/agentCapabilityProvider.ts` — both register same tools simultaneously | `puppetFaceTools.ts` |
| **High** | `extensionTools.ts` (2174 lines) is **legacy centralized tool layer**, coexists with per-package CapabilityProviders | `extensionTools.ts` |
| **Medium** | ~85 bare `catch {}` blocks; hookManager compile errors silently swallowed; qualityCheck LLM parse failure falls back to score=0 with no log | `hookManager.ts:198`, `qualityCheckTools.ts:287` |
| **Medium** | `pipeline-progress-bridge.ts` mediaType **hardcoded to 'image'** — video scene metadata is incorrect | `pipeline-progress-bridge.ts:227` |
| **Medium** | SkillMarketService version **hardcoded '0.0.1'** | `SkillMarketService.ts:69` |
| **Low** | platform sub-package test coverage only **27.9%**, all 10 media adapters have zero unit tests | `platform/src/media/adapters/` |
| **Low** | MCP stdio client disconnect does not `removeAllListeners()` | `mcp-client.ts:253` |

---

## 2. neko-canvas (Storyboard / Canvas)

**Architecture Health: ★★★☆☆**

13 node types, CSS transform rendering, Zustand state management, AI generation panel with ControlNet + video generation, well-developed cross-extension integration.

### Issues

| Severity | Issue | Location |
|----------|-------|----------|
| **High** | `activeWebviewPanel` stores only one reference — **when multiple .nkc files are open, API/Save all target the last one**, data may be written to wrong file | `canvasEditorProvider.ts` |
| **High** | `canvasEditorProvider.ts` 1618-line **God Class**: HTML generation + 25+ message types + media proxy + DnD all in one class | same |
| **High** | `backupCustomDocument` returns no-op `delete: () => {}` — **backup data lost on crash** | same |
| **Medium** | `generateId()` uses `Date.now()-Math.random()` — **collisions when batch-creating nodes** (e.g. storyboard import) | `canvasStore.ts:150` |
| **Medium** | AI generation progress pushes `updateNodeData` to undo stack every event — **undo stack filled with intermediate states** | `CanvasApp.tsx:317` |
| **Medium** | 300ms debounced save + no dirty-flag forced flush → **data loss on low-latency crash** | `CanvasApp.tsx:791` |
| **Medium** | No **PDF export** (industry standard for storyboards), no multi-page layout (2/4/6-up) | — |
| **Medium** | No **alignment tools** (align left/center/right/distribute), no snap guide visualization | — |
| **Low** | Webview tests cover only 4 files; all React components + hooks have **zero tests** | `packages/webview/` |

---

## 3. neko-cut (Video Editor)

**Architecture Health: ★★★★☆**

Most complete feature set: full timeline model, 20 transitions, effects/keyframes/masks/shapes, multi-format ExportService, EditOperation pure function pipeline + 200-level undo stack.

### Issues

| Severity | Issue | Location |
|----------|-------|----------|
| **High** | **9 implemented tools not exposed to Agent**: AddShape/UpdateShape, AddMask/UpdateMask/RemoveMask, GetKeyframes/AddKeyframe/UpdateKeyframe/RemoveKeyframe — handlers exist but `agentCapabilityProvider` doesn't register them, bridge has no case for them | `agentCapabilityProvider.ts` |
| **High** | `neko.cut.ai.transcribeToSubtitles` command declared in skill but **registerCommand does not exist** — will throw "command not found" at runtime | `extension.ts:138-145` |
| **High** | `AIActionHandler.sendResult()` `_data` parameter is ignored — P0 AI results (upscale output path, subtitle SRT) **never sent to webview** | `AIActionHandler.ts:472` |
| **Medium** | `ai-auto-edit` / `ai-match-music` return **"Coming soon" stubs** | `AIActionHandler.ts` |
| **Medium** | `TimelineToolExecutor` / `AIActionHandler` use `as unknown as VideoEditorModel` — EditorRegistry interface returns base `IEditorModel`, lacks typed getter | `TimelineToolExecutor.ts:59` |
| **Medium** | `elementOpsSlice` (884 lines, core editing operations) has only **34% line coverage** | `elementOpsSlice.ts` |
| **Low** | `videoEditorProvider.ts` 1113 lines, `TimelineTrack.tsx` 1182 lines — candidates for splitting | — |

---

## 4. neko-preview (Media Preview)

**Architecture Health: ★★★★☆**

Covers video (H.264 WebSocket → WebCodecs), audio (PCM + waveform + spectrum), PDF (pdfjs-dist), EPUB (epub.js + custom ZIP parser), DOCX (docx-preview), CBZ (zip.js lazy decode). Zero TODO comments.

### Issues

| Severity | Issue | Location |
|----------|-------|----------|
| **High** | `.doc` (binary Word OLE2) registered in manifest but docx-preview **cannot render** it — opens as garbled/crash | `package.json:103` |
| **Medium** | XLSX / PPTX **completely unsupported** (marked Phase 2 in ROADMAP) | — |
| **Medium** | DOCX **loaded entirely into memory** with no size guard — 50MB+ files spike memory | `DocxViewer.tsx:40-52` |
| **Medium** | VideoPlayer AudioContext **hardcoded 48kHz** — 44.1kHz source material gets implicit resampling | `VideoPlayer.tsx:488` |
| **Medium** | CBZ per-page decode error leads to **infinite loading placeholder**, no per-page error state | `CbzViewer.tsx:160-173` |
| **Medium** | PDF `computeViewports` **sequential await** per page getPage() — poor performance on 500-page files | `PdfViewer.tsx:133-145` |
| **Medium** | `EpubParser.ts` (custom ZIP/EOCD parser) has **0% test coverage** | `EpubParser.ts` |
| **Low** | Webview has zero tests (all React components/viewers) | — |

---

## 5. neko-story (Screenwriting)

**Architecture Health: ★★★★☆**

Parser (94% coverage) + full LSP suite (completion/hover/definition/references/rename/diagnostics) + AI pipeline integration (Script → Canvas → Timeline) + creative entity graph.

### Issues

| Severity | Issue | Location |
|----------|-------|----------|
| **High** | **No PDF export** — hard requirement for screenwriting industry | — |
| **High** | **No FDX import/export** — cannot interoperate with Final Draft | — |
| **Medium** | `TextEmphasis` type defined but parser **never produces it** — bold/italic/underline not rendered | `fountain.ts:232-238` |
| **Medium** | Dual dialogue parsed but webview **does not render** it | — |
| **Medium** | `WorkspaceIndexService.getScriptIndex` **rebuilds index on every call** — hover/completion/definition trigger it at high frequency | `WorkspaceIndexService.ts:119` |
| **Medium** | No revision colors, no scene card view, no page count estimation | — |
| **Low** | `inlineCompletion.ts` has zero tests | — |

---

## 6. AI Capability Alignment

### 6.1 TOOL_NAMES Registry vs Actual Implementation

| Status | Count | Details |
|--------|-------|---------|
| **Registered + Implemented** | ~40 | TIMELINE 25, CANVAS 12 (mostly), MEDIA 5, PIPELINE 5, QUALITY 2, STORY 5, SKETCH 4 |
| **Registered but no implementation** | **3** | `TOOL_NAMES_ASSETS`: ListAssets / GetAsset / ImportAsset — neko-assets has no CapabilityProvider |
| **Referenced in ToolGroups but non-existent** | **~20** | See table below |

### 6.2 Ghost Tools in ToolGroups

| ToolGroup | Non-existent tools referenced |
|-----------|------------------------------|
| `animationKeyframesToolSet` | GetKeyframes, AddKeyframe, UpdateKeyframe, RemoveKeyframe |
| `shapeMaskToolSet` | AddShape, UpdateShape, AddMask, UpdateMask, RemoveMask |
| `exportRenderToolSet` | ExportVideo, GetExportProgress, RenderFrame, RenderClip, GetThumbnail |
| `gitOperationsToolSet` | GitStatus, GitDiff, GitLog |
| `aiGenerationToolSet` | GenerateCharacter, TransferStyle, EnhanceVideo, OptimizeAudio |
| `coreSystemToolSet` | Grep, WebSearch (not in TOOL_NAMES_SYSTEM) |

**Note**: Shape/Mask/Keyframe (9 tools) have **working handler implementations** in neko-cut `tools/` but are not exposed through `agentCapabilityProvider` nor registered in TOOL_NAMES.

### 6.3 CapabilityProvider Coverage Matrix

| Package | Implemented | Gap |
|---------|-------------|-----|
| neko-cut | ✅ 25+1 tools | 9 handlers not exposed (Shape/Mask/Keyframe) |
| neko-canvas | ✅ 12 tools | Complete |
| neko-story | ✅ 5 tools | Complete |
| neko-sketch | ✅ 4 tools | Silently returns empty array when mediaService unavailable |
| neko-puppet | ✅ 3 tools | Duplicates agent-internal puppetFaceTools.ts |
| neko-engine | ✅ Engine tools | Complete |
| **neko-assets** | ❌ | No Provider; TOOL_NAMES_ASSETS 3 tools unimplemented |
| **neko-audio** | ❌ | No Provider |
| **neko-model** | ❌ | No Provider; FaceEditorPanel AI call not implemented |
| **neko-preview** | ❌ | No Provider (passive via sendContext only) |
| **neko-live** | ❌ | No Provider |

### 6.4 Legacy Dual-Track Problem

Two tool registration paths coexist at runtime:

```
Old path: extensionTools.ts (centralized 2174 lines) → toolBootstrap.ts fallback
New path: AgentCapabilityProvider (per-package) → CapabilityDiscoveryService
```

neko-cut/canvas/story/sketch/puppet/engine have migrated to the new path, but `extensionTools.ts` is still running and **not deprecated**. `puppetFaceTools.ts` is a full duplicate. Risks:
- Same tool may be registered twice
- Two codebases to maintain
- New developers don't know which to modify

---

## 7. Recommendations

### Blockers (Fix Immediately)

1. **neko-canvas multi-editor correctness** — `activeWebviewPanel` single-slot design causes wrong file writes when multiple editors are open
2. **neko-cut 9 tools not exposed** — Agent cannot operate Shape/Mask/Keyframe, significant capability gap
3. **neko-cut `transcribeToSubtitles` command not registered** — Skill declared but runtime will crash
4. **neko-cut `AIActionHandler.sendResult` discards data** — AI processing completes but webview never receives results

### High Priority

5. **Clean up dual-track tool registration** — Deprecate `extensionTools.ts` + `puppetFaceTools.ts`, unify on CapabilityProvider
6. **neko-assets implement CapabilityProvider** — 3 TOOL_NAMES tools have no implementation
7. **neko-story / neko-canvas PDF export** — Industry baseline requirement for screenwriting and storyboards
8. **neko-agent `deactivate()` complete** — FileSystemWatcher leak
9. **pipeline mediaType detection** — Currently all generated assets are tagged as 'image'

### Tech Debt Cleanup

10. ~20 ghost tool names in ToolGroups: either implement or remove from ToolGroup definitions
11. neko-cut `IEditorRegistry` add typed getter to eliminate `as unknown as VideoEditorModel`
12. neko-canvas `generateId()` switch to `crypto.randomUUID()`
13. neko-preview remove `.doc` from manifest or add OLE2 parser
14. neko-story `getScriptIndex` add caching
15. neko-canvas `canvasEditorProvider.ts` God Class decomposition
16. neko-preview PDF sequential page loading → parallel batch
17. neko-preview EpubParser.ts needs tests (0% coverage, custom binary parsing)

---

## Appendix: Test Coverage Summary

| Package | Lines | Branches | Key Gaps |
|---------|-------|----------|----------|
| neko-agent (agent) | 60.4% | — | platform sub-package 27.9%, 10 media adapters zero tests |
| neko-agent (extension) | 57.8% | — | 3 excluded test files (require real VSCode) |
| neko-cut (webview) | 61.7% | 52.6% | elementOpsSlice 34%, mask.ts 2%, shape.ts 8% |
| neko-canvas (webview) | 4 files only | — | All React components + hooks zero tests |
| neko-preview (extension) | 49.5% | 37.1% | EpubParser 0%, PreviewFileServer 8%, all doc providers ~28% |
| neko-preview (webview) | 0% | 0% | All viewers zero tests |
| neko-story (parser) | 94.0% | 75.2% | Good |
| neko-story (extension) | 74.5% | 61.3% | diagnostics 14% functions, hover 38% branches |
| neko-story (webview) | 69.5% | 72.7% | useVSCodeMessaging 13% |
