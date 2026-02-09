import * as vscode from 'vscode';
import type { IWorkspaceIndex } from '../services/types';

/** SymbolKind mapping consistent with documentSymbol.ts */
const KIND_MAP = {
  character: vscode.SymbolKind.Variable,
  scene: vscode.SymbolKind.Function,
  section: vscode.SymbolKind.Namespace,
} as const;

/**
 * Provides workspace-wide symbol search (Ctrl+T / Cmd+T).
 * Delegates to IWorkspaceIndex for cross-file symbol lookup.
 */
export class FountainWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  constructor(private readonly index: IWorkspaceIndex) {}

  async provideWorkspaceSymbols(
    query: string,
    _token: vscode.CancellationToken
  ): Promise<vscode.SymbolInformation[]> {
    await this.index.ensureInitialized();

    const locations = this.index.searchSymbols(query);
    return locations.map(loc => new vscode.SymbolInformation(
      loc.name,
      KIND_MAP[loc.kind],
      loc.detail ?? '',
      new vscode.Location(loc.uri, loc.range)
    ));
  }
}
