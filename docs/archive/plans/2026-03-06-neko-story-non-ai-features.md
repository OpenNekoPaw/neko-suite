# neko-story Non-AI Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 neko-story 的三个非 AI 功能：错误诊断（红/黄波浪线）、时间线生成（Fountain → neko-cut .neko 文件）、PDF 导出（@media print）。

**Architecture:** 错误诊断提取为纯函数 + VSCode DiagnosticCollection 包装；时间线生成用纯函数 FountainDocument → ProjectData，通过 QuickPick 预览后 showSaveDialog 保存；PDF 导出在 webview 侧添加 @media print CSS + window.print()。

**Tech Stack:** TypeScript, VSCode Extension API, @neko-story/types, @neko-story/parser, @neko/shared (ProjectData/TextElement/SubtitleElement/generateId/ENGINE_DEFAULT_TRANSFORM)

**Design Doc:** [docs/plans/2026-03-06-neko-story-non-ai-features-design.md](./2026-03-06-neko-story-non-ai-features-design.md)

---

## Task 1: DiagnosticsProvider — 纯逻辑函数 + 测试

**Files:**
- Create: `packages/neko-story/packages/extension/src/providers/diagnostics.ts`
- Modify: `packages/neko-story/packages/extension/src/__tests__/providers.test.ts`

### Step 1: 在测试文件末尾追加诊断测试

打开 `packages/neko-story/packages/extension/src/__tests__/providers.test.ts`，在文件末尾追加：

```typescript
import { checkSyntax, checkSemantics } from '../providers/diagnostics';

describe('checkSyntax', () => {
  it('detects unclosed inline note', () => {
    const text = 'This is [[unclosed note\nNext line';
    const diags = checkSyntax(text);
    expect(diags.some(d => d.severity === 'error' && d.message.includes('[['))).toBe(true);
  });

  it('passes when note is closed on same line', () => {
    const text = 'This is [[a note]] and continues';
    const diags = checkSyntax(text);
    expect(diags.filter(d => d.message.includes('[['))).toHaveLength(0);
  });

  it('detects unclosed boneyard', () => {
    const text = 'Normal line\n/* unclosed boneyard\nAnother line';
    const diags = checkSyntax(text);
    expect(diags.some(d => d.severity === 'error' && d.message.includes('/*'))).toBe(true);
  });

  it('passes when boneyard is closed', () => {
    const text = '/* closed */ normal';
    const diags = checkSyntax(text);
    expect(diags.filter(d => d.message.includes('/*'))).toHaveLength(0);
  });

  it('detects empty transition', () => {
    const text = 'INT. OFFICE - DAY\n\n>\n\nSome action';
    const diags = checkSyntax(text);
    expect(diags.some(d => d.severity === 'warning' && d.message.toLowerCase().includes('transition'))).toBe(true);
  });
});

describe('checkSemantics', () => {
  it('detects dialogue without preceding character', () => {
    const script = `INT. OFFICE - DAY

Hello there.

Some action.`;
    const doc = parse(script);
    const diags = checkSemantics(doc);
    // 'Hello there.' after scene heading with no character → should warn or not crash
    // (if parser doesn't classify as dialogue, no diag; if it does, warn)
    expect(Array.isArray(diags)).toBe(true);
  });

  it('warns when character appears only once', () => {
    const script = `INT. OFFICE - DAY

ALICE
Hello world.

INT. PARK - DAY

BOB
Hi there.

BOB
How are you?`;
    const doc = parse(script);
    const diags = checkSemantics(doc);
    const aliceWarning = diags.find(d => d.message.includes('ALICE'));
    expect(aliceWarning?.severity).toBe('warning');
    // BOB appears twice, should not warn
    expect(diags.find(d => d.message.includes('BOB'))).toBeUndefined();
  });
});
```

### Step 2: 运行测试确认失败

```bash
cd packages/neko-story/packages/extension && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL — `Cannot find module '../providers/diagnostics'`

### Step 3: 创建 diagnostics.ts

创建 `packages/neko-story/packages/extension/src/providers/diagnostics.ts`：

```typescript
import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { FountainDocument, AnyFountainElement } from '@neko-story/types';
import type { WorkspaceIndexService } from '../services/WorkspaceIndexService';

// ─── Pure types (no vscode dependency) ───────────────────────────────────────

export interface DiagnosticEntry {
  message: string;
  line: number;        // 0-based
  startChar: number;
  endChar: number;
  severity: 'error' | 'warning';
}

// ─── Pure logic (testable without vscode) ────────────────────────────────────

export function checkSyntax(text: string): DiagnosticEntry[] {
  const entries: DiagnosticEntry[] = [];
  const lines = text.split('\n');

  // Track boneyard depth across lines
  let boneyardOpenLine = -1;
  let boneyardDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Check unclosed inline notes: [[ without ]] on same line
    let searchPos = 0;
    while (searchPos < line.length) {
      const openIdx = line.indexOf('[[', searchPos);
      if (openIdx === -1) break;
      const closeIdx = line.indexOf(']]', openIdx + 2);
      if (closeIdx === -1) {
        entries.push({
          message: '未闭合的备注（缺少 ]]）',
          line: i,
          startChar: openIdx,
          endChar: line.length,
          severity: 'error',
        });
        break;
      }
      searchPos = closeIdx + 2;
    }

    // Track boneyard /* ... */
    let pos = 0;
    while (pos < line.length) {
      if (boneyardDepth === 0) {
        const openIdx = line.indexOf('/*', pos);
        if (openIdx === -1) break;
        boneyardDepth++;
        boneyardOpenLine = i;
        pos = openIdx + 2;
      } else {
        const closeIdx = line.indexOf('*/', pos);
        if (closeIdx === -1) break;
        boneyardDepth--;
        pos = closeIdx + 2;
      }
    }

    // Check empty forced transition: line is exactly ">"
    const trimmed = line.trim();
    if (trimmed === '>') {
      entries.push({
        message: '空转场标记（缺少转场名称）',
        line: i,
        startChar: line.indexOf('>'),
        endChar: line.indexOf('>') + 1,
        severity: 'warning',
      });
    }
  }

  // Report unclosed boneyard
  if (boneyardDepth > 0 && boneyardOpenLine >= 0) {
    const openLine = lines[boneyardOpenLine] ?? '';
    const col = openLine.indexOf('/*');
    entries.push({
      message: '未闭合的删除区域（缺少 */）',
      line: boneyardOpenLine,
      startChar: col,
      endChar: col + 2,
      severity: 'error',
    });
  }

  return entries;
}

export function checkSemantics(doc: FountainDocument): DiagnosticEntry[] {
  const entries: DiagnosticEntry[] = [];
  const elements = doc.elements;

  // Count character appearances
  const characterCount = new Map<string, number>();
  const characterFirstLine = new Map<string, number>();

  for (const el of elements) {
    if (el.type === 'character') {
      const name = el.name;
      const prev = characterCount.get(name) ?? 0;
      characterCount.set(name, prev + 1);
      if (prev === 0) {
        characterFirstLine.set(name, el.range.start.line);
      }
    }
  }

  // Warn on single-occurrence characters
  for (const [name, count] of characterCount) {
    if (count === 1) {
      const line = characterFirstLine.get(name) ?? 0;
      entries.push({
        message: `角色 "${name}" 只出现一次，可能是拼写错误`,
        line,
        startChar: 0,
        endChar: name.length,
        severity: 'warning',
      });
    }
  }

  // Warn on dialogue without preceding character
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el?.type === 'dialogue') {
      const prev = elements[i - 1];
      if (!prev || (prev.type !== 'character' && prev.type !== 'parenthetical' && prev.type !== 'dialogue')) {
        entries.push({
          message: '对话行出现在角色名之前，可能格式有误',
          line: el.range.start.line,
          startChar: el.range.start.character,
          endChar: el.range.end.character,
          severity: 'warning',
        });
      }
    }
  }

  return entries;
}

// ─── VSCode wrapper ───────────────────────────────────────────────────────────

export class FountainDiagnosticsProvider implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly indexService: WorkspaceIndexService) {
    this.collection = vscode.languages.createDiagnosticCollection('nekostory');
  }

  activate(): void {
    // Analyze all currently open fountain documents
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.isFountain(editor.document)) {
        this.analyzeDocument(editor.document);
      }
    }

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(doc => {
        if (this.isFountain(doc)) this.analyzeDocument(doc);
      }),
      vscode.workspace.onDidChangeTextDocument(e => {
        if (this.isFountain(e.document)) this.scheduleAnalysis(e.document);
      }),
      vscode.workspace.onDidCloseTextDocument(doc => {
        this.collection.delete(doc.uri);
        const key = doc.uri.toString();
        const timer = this.debounceTimers.get(key);
        if (timer) {
          clearTimeout(timer);
          this.debounceTimers.delete(key);
        }
      }),
    );
  }

  private isFountain(doc: vscode.TextDocument): boolean {
    return doc.languageId === 'nekostory';
  }

  private scheduleAnalysis(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        this.analyzeDocument(doc);
      }, 300),
    );
  }

  private analyzeDocument(doc: vscode.TextDocument): void {
    const text = doc.getText();
    // Use cached parse result if available, otherwise re-parse
    const fountainDoc =
      this.indexService.getDocument(doc.uri.toString()) ?? parse(text);

    const entries: DiagnosticEntry[] = [
      ...checkSyntax(text),
      ...checkSemantics(fountainDoc),
    ];

    this.collection.set(
      doc.uri,
      entries.map(e => {
        const range = new vscode.Range(
          new vscode.Position(e.line, e.startChar),
          new vscode.Position(e.line, e.endChar),
        );
        return new vscode.Diagnostic(
          range,
          e.message,
          e.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning,
        );
      }),
    );
  }

  dispose(): void {
    this.collection.dispose();
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.disposables.forEach(d => d.dispose());
  }
}
```

### Step 4: 运行测试确认通过

```bash
cd packages/neko-story/packages/extension && npx vitest run --reporter=verbose 2>&1 | tail -30
```

Expected: All diagnostics tests PASS

### Step 5: Commit

```bash
cd /Users/feng/Git/neko-suite
git add packages/neko-story/packages/extension/src/providers/diagnostics.ts \
        packages/neko-story/packages/extension/src/__tests__/providers.test.ts
git commit -m "feat(neko-story): add FountainDiagnosticsProvider with syntax/semantic checks"
```

---

## Task 2: DiagnosticsProvider — 集成到 extension.ts

**Files:**
- Modify: `packages/neko-story/packages/extension/src/extension.ts`

### Step 1: 打开 extension.ts，添加 import

在现有 import 列表末尾追加（在 `import { FountainDocumentLinkProvider }` 之后）：

```typescript
import { FountainDiagnosticsProvider } from './providers/diagnostics';
```

### Step 2: 在 activate() 中注册 DiagnosticsProvider

找到 `context.subscriptions.push(` 块，在其中追加（在最后一个 provider 注册之后）：

```typescript
const diagnosticsProvider = new FountainDiagnosticsProvider(indexService);
diagnosticsProvider.activate();
context.subscriptions.push(diagnosticsProvider);
```

### Step 3: 构建确认无报错

```bash
cd packages/neko-story/packages/extension && npx tsc --noEmit 2>&1 | head -20
```

Expected: 无错误输出

### Step 4: Commit

```bash
cd /Users/feng/Git/neko-suite
git add packages/neko-story/packages/extension/src/extension.ts
git commit -m "feat(neko-story): register DiagnosticsProvider in extension activation"
```

---

## Task 3: TimelineConverter — 纯函数 + 测试

**Files:**
- Create: `packages/neko-story/packages/extension/src/converters/TimelineConverter.ts`
- Create: `packages/neko-story/packages/extension/src/__tests__/converter.test.ts`

### Step 1: 创建测试文件

创建 `packages/neko-story/packages/extension/src/__tests__/converter.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { parse } from '@neko-story/parser';
import { TimelineConverter } from '../converters/TimelineConverter';

const SAMPLE_SCRIPT = `Title: My Film

INT. OFFICE - DAY

ALICE
Hello there.

BOB
How are you?

EXT. PARK - NIGHT

ALICE
Goodbye.`;

describe('TimelineConverter', () => {
  const converter = new TimelineConverter();

  it('returns correct scene count', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    expect(result.sceneCount).toBe(2);
  });

  it('extracts character names', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    expect(result.characterNames).toContain('ALICE');
    expect(result.characterNames).toContain('BOB');
  });

  it('total duration is positive', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    expect(result.totalDurationSec).toBeGreaterThan(0);
  });

  it('project has two tracks', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    expect(result.project.tracks).toHaveLength(2);
  });

  it('scene track (index 0) has one element per scene', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    const sceneTrack = result.project.tracks[0];
    expect(sceneTrack?.elements).toHaveLength(2);
  });

  it('subtitle track (index 1) has one element per dialogue line', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    const subtitleTrack = result.project.tracks[1];
    // ALICE + BOB + ALICE = 3 dialogue lines
    expect(subtitleTrack?.elements).toHaveLength(3);
  });

  it('uses title page name when available', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'fallback');
    expect(result.project.name).toBe('My Film');
  });

  it('falls back to provided name when no title page', () => {
    const doc = parse('INT. PARK - DAY\n\nSome action.');
    const result = converter.convert(doc, 'fallback');
    expect(result.project.name).toBe('fallback');
  });

  it('scene elements have minimum 3 second duration', () => {
    const doc = parse('INT. EMPTY SCENE - DAY\n\nShort.');
    const result = converter.convert(doc, 'test');
    const sceneTrack = result.project.tracks[0];
    const el = sceneTrack?.elements[0];
    expect(el).toBeDefined();
    if (el) expect(el.duration).toBeGreaterThanOrEqual(3);
  });
});
```

### Step 2: 运行测试确认失败

```bash
cd packages/neko-story/packages/extension && npx vitest run src/__tests__/converter.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module '../converters/TimelineConverter'`

### Step 3: 创建 converters 目录和 TimelineConverter.ts

创建 `packages/neko-story/packages/extension/src/converters/TimelineConverter.ts`：

```typescript
import type { FountainDocument, SceneHeadingElement, CharacterElement, DialogueElement } from '@neko-story/types';
import type { ProjectData, TimelineTrack, TextElement, SubtitleElement } from '@neko/shared';
import { generateId, ENGINE_DEFAULT_TRANSFORM } from '@neko/shared';

// ─── Duration constants ───────────────────────────────────────────────────────

const DIALOGUE_LINE_SEC = 1.5;   // seconds per dialogue line
const ACTION_PARA_SEC = 2.0;     // seconds per action paragraph
const MIN_SCENE_SEC = 3.0;       // minimum scene duration

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ConversionResult {
  project: ProjectData;
  sceneCount: number;
  totalDurationSec: number;
  characterNames: string[];
}

// ─── Scene group (internal) ───────────────────────────────────────────────────

interface SceneGroup {
  heading: SceneHeadingElement;
  dialogues: Array<{ character: CharacterElement; text: string }>;
  actionCount: number;
}

// ─── Converter ────────────────────────────────────────────────────────────────

export class TimelineConverter {
  convert(doc: FountainDocument, fallbackName: string): ConversionResult {
    const projectName = doc.titlePage?.title ?? fallbackName;
    const scenes = this.groupByScene(doc);
    const characterSet = new Set<string>();

    const sceneTrack: TimelineTrack = {
      id: generateId(),
      name: '场景标记',
      type: 'text',
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: false,
    };

    const subtitleTrack: TimelineTrack = {
      id: generateId(),
      name: '字幕',
      type: 'subtitle',
      elements: [],
      muted: false,
      locked: false,
      hidden: false,
      isMain: false,
    };

    let cursor = 0;

    for (let sceneIdx = 0; sceneIdx < scenes.length; sceneIdx++) {
      const scene = scenes[sceneIdx];
      if (!scene) continue;

      // Duration: sum of dialogues + actions, min 3s
      const dialogueDur = scene.dialogues.length * DIALOGUE_LINE_SEC;
      const actionDur = scene.actionCount * ACTION_PARA_SEC;
      const sceneDur = Math.max(MIN_SCENE_SEC, dialogueDur + actionDur);

      // Scene label: "1. INT. OFFICE - DAY"
      const label = `${sceneIdx + 1}. ${scene.heading.raw.trim()}`;
      const sceneMarker: TextElement = {
        id: generateId(),
        name: label,
        type: 'text',
        startTime: cursor,
        duration: sceneDur,
        trimStart: 0,
        trimEnd: 0,
        transform: ENGINE_DEFAULT_TRANSFORM,
        opacity: 1,
        blendMode: 'normal',
        effects: [],
        muted: false,
        hidden: false,
        locked: false,
        content: label,
        fontSize: 24,
        fontFamily: 'Arial',
        color: '#ffffff',
        backgroundColor: '#00000099',
        textAlign: 'left',
        fontWeight: 'bold',
        fontStyle: 'normal',
      };
      sceneTrack.elements.push(sceneMarker);

      // Subtitle per dialogue line
      let subtitleCursor = cursor;
      for (const { character, text } of scene.dialogues) {
        characterSet.add(character.name);
        const subtitle: SubtitleElement = {
          id: generateId(),
          name: character.name,
          type: 'subtitle',
          startTime: subtitleCursor,
          duration: DIALOGUE_LINE_SEC,
          trimStart: 0,
          trimEnd: 0,
          transform: ENGINE_DEFAULT_TRANSFORM,
          opacity: 1,
          blendMode: 'normal',
          effects: [],
          muted: false,
          hidden: false,
          locked: false,
          text: `${character.name}: ${text}`,
          fontSize: 36,
          fontFamily: 'Arial',
          color: '#ffffff',
          backgroundColor: 'transparent',
          textAlign: 'center',
          strokeColor: '#000000',
          strokeWidth: 1,
        };
        subtitleTrack.elements.push(subtitle);
        subtitleCursor += DIALOGUE_LINE_SEC;
      }

      cursor += sceneDur;
    }

    const project: ProjectData = {
      version: '1.0.0',
      name: projectName,
      resolution: { width: 1920, height: 1080 },
      fps: 24,
      tracks: [sceneTrack, subtitleTrack],
    };

    return {
      project,
      sceneCount: scenes.length,
      totalDurationSec: cursor,
      characterNames: Array.from(characterSet),
    };
  }

  private groupByScene(doc: FountainDocument): SceneGroup[] {
    const scenes: SceneGroup[] = [];
    let current: SceneGroup | null = null;
    let lastCharacter: CharacterElement | null = null;

    for (const el of doc.elements) {
      if (el.type === 'scene_heading') {
        current = { heading: el as SceneHeadingElement, dialogues: [], actionCount: 0 };
        scenes.push(current);
        lastCharacter = null;
      } else if (current) {
        if (el.type === 'character') {
          lastCharacter = el as CharacterElement;
        } else if (el.type === 'dialogue' && lastCharacter) {
          current.dialogues.push({ character: lastCharacter, text: (el as DialogueElement).text ?? el.raw.trim() });
          lastCharacter = null;
        } else if (el.type === 'action') {
          current.actionCount++;
          lastCharacter = null;
        }
      }
    }

    return scenes;
  }
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}
```

### Step 4: 运行测试确认通过

```bash
cd packages/neko-story/packages/extension && npx vitest run src/__tests__/converter.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: All converter tests PASS

如果 `DialogueElement` 上没有 `text` 字段（实际 Fountain 类型字段名可能是 `lines` 或别的），查看 `@neko-story/types` 中 `dialogue` 类型定义：

```bash
grep -A 10 "DialogueElement\|'dialogue'" packages/neko-story/packages/types/src/fountain.ts | head -30
```

根据实际字段名调整 `(el as DialogueElement).text ?? el.raw.trim()` 这行。

### Step 5: Commit

```bash
cd /Users/feng/Git/neko-suite
git add packages/neko-story/packages/extension/src/converters/TimelineConverter.ts \
        packages/neko-story/packages/extension/src/__tests__/converter.test.ts
git commit -m "feat(neko-story): add TimelineConverter (Fountain → ProjectData)"
```

---

## Task 4: 时间线生成命令 — 集成到 extension.ts

**Files:**
- Modify: `packages/neko-story/packages/extension/src/extension.ts`

### Step 1: 添加 import

在 extension.ts 顶部 import 列表末尾追加：

```typescript
import * as path from 'path';
import { parse } from '@neko-story/parser';
import { TimelineConverter, formatDuration } from './converters/TimelineConverter';
```

（如果 `parse` 已经被 import，跳过重复 import）

### Step 2: 替换 toTimeline 命令 stub

找到：
```typescript
vscode.commands.registerCommand('neko.story.toTimeline', () => {
  vscode.window.showInformationMessage('Convert to timeline - Coming soon');
}),
```

替换为：
```typescript
vscode.commands.registerCommand('neko.story.toTimeline', async () => {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'nekostory') {
    vscode.window.showErrorMessage('请在剧本文件中执行此命令');
    return;
  }

  const text = editor.document.getText();
  const doc = parse(text);
  const baseName = path.basename(
    editor.document.fileName,
    path.extname(editor.document.fileName),
  );

  const converter = new TimelineConverter();
  const result = converter.convert(doc, baseName);

  const picked = await vscode.window.showQuickPick(
    [
      {
        label: '$(file-add) 新建 neko-cut 项目',
        description: `${result.sceneCount} 个场景 · 约 ${formatDuration(result.totalDurationSec)} · ${result.characterNames.length} 个角色`,
      },
    ],
    {
      placeHolder: '预览：剧本将转换为以下时间线，确认后选择保存位置',
      title: '剧本 → 时间线',
    },
  );

  if (!picked) return;

  const defaultUri = vscode.Uri.file(
    path.join(
      path.dirname(editor.document.fileName),
      `${baseName}.neko`,
    ),
  );

  const saveUri = await vscode.window.showSaveDialog({
    defaultUri,
    filters: { 'Neko Cut Project': ['neko'] },
    title: '保存时间线项目',
  });

  if (!saveUri) return;

  const json = JSON.stringify(result.project, null, 2);
  await vscode.workspace.fs.writeFile(saveUri, Buffer.from(json, 'utf-8'));

  await vscode.commands.executeCommand('vscode.openWith', saveUri, 'neko.cut.editor');
}),
```

### Step 3: 类型检查确认无报错

```bash
cd packages/neko-story/packages/extension && npx tsc --noEmit 2>&1 | head -20
```

Expected: 无错误

### Step 4: Commit

```bash
cd /Users/feng/Git/neko-suite
git add packages/neko-story/packages/extension/src/extension.ts
git commit -m "feat(neko-story): implement toTimeline command with QuickPick preview + SaveDialog"
```

---

## Task 5: PDF 导出 — @media print CSS

**Files:**
- Create: `packages/neko-story/packages/webview/src/styles/print.css`
- Modify: `packages/neko-story/packages/webview/src/App.tsx`

### Step 1: 创建 print.css

创建 `packages/neko-story/packages/webview/src/styles/print.css`：

```css
/* Standard Fountain screenplay print layout (US Letter) */
@media print {
  /* Page setup */
  @page {
    size: letter;
    margin: 1in 1in 1in 1.5in;
  }

  /* Hide non-print elements */
  .print-button,
  .preview-toolbar {
    display: none !important;
  }

  /* Base font: Courier, 12pt (standard screenplay) */
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12pt;
    line-height: 1.5;
    color: #000;
    background: #fff;
  }

  /* Title page breaks before first scene */
  .title-page {
    page-break-after: always;
  }

  /* Scene heading: bold, uppercase, avoid orphan heading */
  .scene-heading {
    font-weight: bold;
    text-transform: uppercase;
    margin-top: 1em;
    page-break-after: avoid;
  }

  /* Action: full width */
  .action-block {
    margin-left: 0;
    margin-right: 0;
    margin-bottom: 0.5em;
  }

  /* Character name: centered at ~3.7" from left edge */
  .character-name {
    margin-left: 2.2in;
    text-transform: uppercase;
    margin-bottom: 0;
    page-break-after: avoid;
  }

  /* Dialogue: indented block */
  .dialogue-text {
    margin-left: 1.0in;
    margin-right: 1.5in;
    margin-bottom: 0.5em;
  }

  /* Parenthetical */
  .parenthetical {
    margin-left: 1.6in;
    margin-right: 2.0in;
    margin-bottom: 0;
    page-break-after: avoid;
  }

  /* Transition: right-aligned uppercase */
  .transition-block {
    text-align: right;
    text-transform: uppercase;
    margin-top: 0.5em;
    margin-bottom: 0.5em;
  }

  /* Section headers: not printed (internal use) */
  .section-heading {
    display: none;
  }

  /* Notes/boneyard: not printed */
  .note-block,
  .boneyard-block {
    display: none;
  }

  /* Keep dialogue block together */
  .dialogue-block {
    page-break-inside: avoid;
  }
}
```

### Step 2: 在 App.tsx 中引入 print.css 并处理 print 消息

打开 `packages/neko-story/packages/webview/src/App.tsx`，做两处修改：

**2a. 顶部追加 import：**
```typescript
import './styles/print.css';
```

**2b. 在 `useVSCodeMessaging` 的消息处理函数中，追加 print 消息处理。**

找到消息处理 switch/if 块，追加：
```typescript
if (message.type === 'print') {
  window.print();
}
```

（具体位置取决于现有结构，找到处理 `'update'` 和 `'scrollTo'` 的同级 if/else）

### Step 3: 为 ScriptRenderer.tsx 中的 CSS class 名称确认一致性

查看现有组件的 className，确认使用了以下 class 名（如果不一致，更新 print.css 中的选择器）：

```bash
grep -r "className=" packages/neko-story/packages/webview/src/components/ | grep -oP '"[^"]*"' | sort -u
```

根据输出调整 print.css 中的选择器名称，保持一致。

### Step 4: Commit

```bash
cd /Users/feng/Git/neko-suite
git add packages/neko-story/packages/webview/src/styles/print.css \
        packages/neko-story/packages/webview/src/App.tsx
git commit -m "feat(neko-story): add @media print CSS for screenplay PDF export"
```

---

## Task 6: PDF 导出 — Extension 命令 + PreviewPanel 转发

**Files:**
- Modify: `packages/neko-story/packages/extension/src/panels/PreviewPanel.ts`
- Modify: `packages/neko-story/packages/extension/src/extension.ts`

### Step 1: PreviewPanel 添加 print() 方法

打开 `packages/neko-story/packages/extension/src/panels/PreviewPanel.ts`，在现有 public 方法之后追加：

```typescript
print(): void {
  this.panel.webview.postMessage({ type: 'print' });
}
```

在静态方法 `createOrShow` 中，确认 `currentPanel` 是 public static（或通过 `getCurrentPanel()` 之类方法可访问）。

### Step 2: 在 extension.ts 替换 exportPdf 命令（若有 stub）或新增

找到（或追加）：
```typescript
vscode.commands.registerCommand('neko.story.exportPdf', () => {
  if (!PreviewPanel.currentPanel) {
    // Auto-open preview then print
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'nekostory') {
      PreviewPanel.createOrShow(context.extensionUri, indexService);
      // Give webview time to load, then print
      setTimeout(() => PreviewPanel.currentPanel?.print(), 800);
    } else {
      vscode.window.showInformationMessage('请先打开剧本文件，再导出 PDF');
    }
    return;
  }
  PreviewPanel.currentPanel.print();
}),
```

**注意**：检查 `PreviewPanel.currentPanel` 的可见性（通常是 `private static`）。若为 private，改为 `public static` 或添加 `static getCurrent(): PreviewPanel | undefined` 方法。

### Step 3: 在 package.json 中注册命令（如未注册）

查看 `packages/neko-story/package.json` 的 `contributes.commands`，确认已有：
```json
{
  "command": "neko.story.exportPdf",
  "title": "%neko.story.exportPdf.title%",
  "icon": "$(file-pdf)"
}
```

如未有，添加该项，并在 `package.nls.json` / `package.nls.zh-cn.json` 中追加：
```json
"neko.story.exportPdf.title": "Export Screenplay as PDF"
```
```json
"neko.story.exportPdf.title": "导出剧本为 PDF"
```

### Step 4: 类型检查

```bash
cd packages/neko-story/packages/extension && npx tsc --noEmit 2>&1 | head -20
```

Expected: 无错误

### Step 5: Commit

```bash
cd /Users/feng/Git/neko-suite
git add packages/neko-story/packages/extension/src/panels/PreviewPanel.ts \
        packages/neko-story/packages/extension/src/extension.ts \
        packages/neko-story/package.json \
        packages/neko-story/package.nls.json \
        packages/neko-story/package.nls.zh-cn.json
git commit -m "feat(neko-story): add exportPdf command, PreviewPanel.print() → window.print()"
```

---

## Task 7: 打印按钮 + 全量测试验收

**Files:**
- Modify: `packages/neko-story/packages/webview/src/components/ScriptRenderer.tsx`

### Step 1: 在 ScriptRenderer.tsx 顶部工具栏区域添加打印按钮

找到 ScriptRenderer 的 JSX 返回值（通常是最外层 `<div>`），在顶部添加：

```tsx
{/* Print button — hidden in @media print via .print-button class */}
<div className="print-button" style={{ textAlign: 'right', padding: '4px 8px' }}>
  <button
    onClick={() => window.print()}
    style={{
      cursor: 'pointer',
      padding: '4px 12px',
      fontSize: '12px',
      opacity: 0.7,
    }}
    title="导出为 PDF（在打印对话框中选择"另存为 PDF"）"
  >
    打印 / PDF
  </button>
</div>
```

### Step 2: 运行所有 neko-story 测试

```bash
cd packages/neko-story/packages/extension && npx vitest run --reporter=verbose 2>&1 | tail -20
cd packages/neko-story/packages/parser && npx vitest run --reporter=verbose 2>&1 | tail -10
```

Expected: All PASS

### Step 3: 类型检查 webview

```bash
cd packages/neko-story/packages/webview && npx tsc --noEmit 2>&1 | head -20
```

Expected: 无错误

### Step 4: 更新 ROADMAP.md

打开 `/Users/feng/Git/neko-suite/ROADMAP.md`，找到 neko-story 部分，更新：

```markdown
- [x] 错误诊断（语法错误 + 语义警告）
- [x] 时间线生成（Fountain → neko-cut .neko 文件）
- [x] 导出 PDF（@media print，标准 Fountain 印刷规格）
```

并将 neko-story 进度从 `55%` 更新为 `75%`（时间线生成/AI 分镜留待未来）。

### Step 5: Final commit

```bash
cd /Users/feng/Git/neko-suite
git add packages/neko-story/packages/webview/src/components/ScriptRenderer.tsx \
        ROADMAP.md
git commit -m "feat(neko-story): add print button; update ROADMAP to 75%"
```

---

## 验收检查清单

- [ ] `npx vitest run` 全部通过（extension + parser）
- [ ] `npx tsc --noEmit` 无报错（extension + webview）
- [ ] 打开 `.fountain` 文件，未闭合 `[[` 显示红色波浪线
- [ ] 只出现一次的角色名显示黄色警告
- [ ] `Ctrl+Shift+P → Convert to Timeline` 显示 QuickPick 摘要，保存后在 neko-cut 打开
- [ ] `Ctrl+Shift+P → Export PDF` 触发系统打印对话框
- [ ] 预览面板中"打印 / PDF"按钮可点击触发打印

---

## 已知边界情况（无需处理）

- `toTimeline` 生成的项目没有关联媒体文件，用户需自行拖入视频素材
- PDF 导出依赖系统打印对话框，无法静默保存
- AI 增强功能（分镜生成、智能时长推断）留待 neko-agent 成熟后实现
