/**
 * Media LSP Module — Entry point
 *
 * Initializes all JVI language features:
 *   Phase 1: Diagnostics + Hover (media metadata)
 *   Phase 2: DocumentSymbol + Definition + References (cross-file navigation)
 */

import * as vscode from 'vscode';
import type { EngineMediaService } from '../services/EngineMediaService';
import { getLogger } from '../utils/logger';
import { MediaProbeCache } from './services/MediaProbeCache';

const logger = getLogger('MediaLsp');
import { JviDiagnosticsProvider } from './providers/JviDiagnosticsProvider';
import { JviHoverProvider } from './providers/JviHoverProvider';
import { JviDocumentSymbolProvider } from './providers/JviDocumentSymbolProvider';
import { JviDefinitionProvider } from './providers/JviDefinitionProvider';
import { JviReferenceProvider } from './providers/JviReferenceProvider';
import { MediaWorkspaceIndex } from './services/MediaWorkspaceIndex';

const JVI_SELECTOR: vscode.DocumentSelector = { language: 'nekotools-jvi' };

/**
 * Initialize the media LSP module.
 * Call during extension activation.
 */
export function initializeMediaLsp(
  context: vscode.ExtensionContext,
  engineService?: EngineMediaService,
): void {
  const probeCache = new MediaProbeCache();

  // ─── Phase 1: Diagnostics + Hover ──────────────────────────────────────

  const diagnostics = new JviDiagnosticsProvider(engineService, probeCache);
  diagnostics.activate();
  context.subscriptions.push(diagnostics);

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      JVI_SELECTOR,
      new JviHoverProvider(engineService, probeCache),
    ),
  );

  // ─── Phase 2: Symbols + Navigation ─────────────────────────────────────

  const workspaceIndex = new MediaWorkspaceIndex();
  context.subscriptions.push(workspaceIndex);
  void workspaceIndex.ensureInitialized();

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(JVI_SELECTOR, new JviDocumentSymbolProvider()),
    vscode.languages.registerDefinitionProvider(
      JVI_SELECTOR,
      new JviDefinitionProvider(workspaceIndex),
    ),
    vscode.languages.registerReferenceProvider(
      JVI_SELECTOR,
      new JviReferenceProvider(workspaceIndex),
    ),
  );

  logger.info('Initialized (Phase 1 + Phase 2)');
}
