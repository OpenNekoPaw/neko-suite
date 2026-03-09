import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { FountainDocument } from '@neko-story/types';
import type { WorkspaceIndexService } from '../services/WorkspaceIndexService';

// ─── Pure types (no vscode dependency) ───────────────────────────────────────

export interface DiagnosticEntry {
  message: string;
  line: number; // 0-based
  startChar: number;
  endChar: number;
  severity: 'error' | 'warning';
}

// ─── Pure logic (testable without vscode) ────────────────────────────────────

export function checkSyntax(text: string): DiagnosticEntry[] {
  const entries: DiagnosticEntry[] = [];
  const lines = text.split('\n');

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
          message: '未闭合的备注 [[ （缺少 ]]）',
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
    if (line.trim() === '>') {
      entries.push({
        message: 'empty transition marker（缺少转场名称）',
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
      message: '未闭合的删除区域 /* （缺少 */）',
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
      if (
        !prev ||
        (prev.type !== 'character' && prev.type !== 'parenthetical' && prev.type !== 'dialogue')
      ) {
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

// ─── VSCode wrapper ───���───────────────────────────────────────────────────────

export class FountainDiagnosticsProvider implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly indexService: WorkspaceIndexService) {
    this.collection = vscode.languages.createDiagnosticCollection('nekostory');
  }

  activate(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.isFountain(editor.document)) {
        this.analyzeDocument(editor.document);
      }
    }

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (this.isFountain(doc)) this.analyzeDocument(doc);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.isFountain(e.document)) this.scheduleAnalysis(e.document);
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
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
    let fountainDoc: FountainDocument;
    try {
      fountainDoc = this.indexService.getDocument(doc.uri) ?? parse(text);
    } catch {
      // parse failed — clear diagnostics and return silently
      this.collection.delete(doc.uri);
      return;
    }

    const entries: DiagnosticEntry[] = [...checkSyntax(text), ...checkSemantics(fountainDoc)];

    this.collection.set(
      doc.uri,
      entries.map((e) => {
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
    this.disposables.forEach((d) => d.dispose());
  }
}
