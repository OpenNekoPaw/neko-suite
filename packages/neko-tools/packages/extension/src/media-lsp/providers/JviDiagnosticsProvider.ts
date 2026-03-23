/**
 * JVI Diagnostics Provider — VSCode wrapper for diagnostic analysis.
 *
 * Watches .nkv documents for open/change/close events, debounces analysis,
 * and publishes DiagnosticEntry[] → vscode.Diagnostic[].
 *
 * Follows the FountainDiagnosticsProvider pattern from neko-story.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { parseJviDocument } from '../services/JviParser';
import { checkStructure, checkReferences } from '../services/JviDiagnosticAnalyzer';
import type { DiagnosticEntry } from '../types';
import type { IMediaProbeCache, ProbeResultLike } from '../services/types';
import type { EngineMediaService } from '../../services/EngineMediaService';

const LANGUAGE_ID = 'nekotools-jvi';
const DEBOUNCE_MS = 300;

export class JviDiagnosticsProvider implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly engineService: EngineMediaService | undefined,
    private readonly probeCache: IMediaProbeCache,
  ) {
    this.collection = vscode.languages.createDiagnosticCollection('nekotools-jvi');
  }

  activate(): void {
    // Analyze already-open documents
    for (const editor of vscode.window.visibleTextEditors) {
      if (this.isJvi(editor.document)) {
        void this.analyzeDocument(editor.document);
      }
    }

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (this.isJvi(doc)) void this.analyzeDocument(doc);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (this.isJvi(e.document)) this.scheduleAnalysis(e.document);
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

  private isJvi(doc: vscode.TextDocument): boolean {
    return doc.languageId === LANGUAGE_ID;
  }

  private scheduleAnalysis(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        void this.analyzeDocument(doc);
      }, DEBOUNCE_MS),
    );
  }

  private async analyzeDocument(doc: vscode.TextDocument): Promise<void> {
    const text = doc.getText();
    const project = parseJviDocument(text);

    if (project.parseError) {
      this.collection.set(doc.uri, [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 1),
          project.parseError,
          vscode.DiagnosticSeverity.Error,
        ),
      ]);
      return;
    }

    // Synchronous structural checks (always run)
    const entries: DiagnosticEntry[] = [...checkStructure(project)];

    // Asynchronous reference checks (only when engine is available)
    if (this.engineService) {
      try {
        const jviDir = path.dirname(doc.uri.fsPath);
        const refEntries = await checkReferences(
          project,
          jviDir,
          this.fileExists.bind(this),
          this.probeFile.bind(this),
        );
        entries.push(...refEntries);
      } catch {
        // Engine unavailable — skip reference checks silently
      }
    }

    this.collection.set(
      doc.uri,
      entries.map((e) => this.toDiagnostic(e)),
    );
  }

  private toDiagnostic(entry: DiagnosticEntry): vscode.Diagnostic {
    const range = new vscode.Range(
      new vscode.Position(entry.line, entry.startChar),
      new vscode.Position(entry.line, entry.endChar),
    );
    const severity =
      entry.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : entry.severity === 'warning'
          ? vscode.DiagnosticSeverity.Warning
          : vscode.DiagnosticSeverity.Information;

    const diag = new vscode.Diagnostic(range, entry.message, severity);
    if (entry.code) {
      diag.code = entry.code;
      diag.source = 'nekotools-jvi';
    }
    return diag;
  }

  private async fileExists(absolutePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
      return true;
    } catch {
      return false;
    }
  }

  private async probeFile(absolutePath: string): Promise<ProbeResultLike | null> {
    // Check cache first
    const cached = this.probeCache.get(absolutePath);
    if (cached) return cached;

    if (!this.engineService) return null;

    try {
      const result = await this.engineService.probe('videos', absolutePath);
      if (result) {
        this.probeCache.set(absolutePath, result as ProbeResultLike);
        return result as ProbeResultLike;
      }
    } catch {
      // Probe failed — fall through
    }

    return null;
  }

  dispose(): void {
    this.collection.dispose();
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.disposables.forEach((d) => d.dispose());
  }
}
