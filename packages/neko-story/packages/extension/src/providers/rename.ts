import * as vscode from 'vscode';
import {
  collectCharacterLookupKeys,
  normalizeCharacterLookupKey,
  type CharacterRecord,
  type CharacterRegistryFile,
} from '@neko/shared';
import type {
  CharacterEntityQuery,
  ICharacterWorkspaceIndex,
  ICreativeEntityWorkspaceIndex,
  IWorkspaceIndex,
} from '../services/types';
import { getCharacterWordRange } from './characterRange';

interface CharacterRenameContext {
  readonly wordRange: vscode.Range;
  readonly characterQuery: CharacterEntityQuery;
  readonly registry: CharacterRegistryFile;
}

/**
 * Character identity rename provider.
 *
 * This deliberately updates only the registry authority (`characters.json`).
 * Script text replacement remains a separate explicit action, matching ADR
 * guidance that identity changes and screenplay wording are different layers.
 */
export class FountainCharacterRenameProvider implements vscode.RenameProvider {
  constructor(
    private readonly index: IWorkspaceIndex,
    private readonly characterIndex: ICharacterWorkspaceIndex,
    private readonly creativeEntityIndex: ICreativeEntityWorkspaceIndex,
  ) {}

  async prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Range | { range: vscode.Range; placeholder: string } | null> {
    const context = await this.getRenameContext(document, position);
    if (!context?.characterQuery.resolved || !context.characterQuery.registryDefinition) {
      return null;
    }

    return {
      range: context.wordRange,
      placeholder: context.characterQuery.resolved.record.canonicalName,
    };
  }

  async provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    _token: vscode.CancellationToken,
  ): Promise<vscode.WorkspaceEdit | null> {
    const context = await this.getRenameContext(document, position);
    if (!context) {
      return null;
    }

    const nextCanonicalName = newName.trim();
    if (!normalizeCharacterLookupKey(nextCanonicalName)) {
      return null;
    }

    const resolvedRecord = context.characterQuery.resolved?.record;
    const registryUri = context.characterQuery.registryDefinition?.uri;
    if (!resolvedRecord || !registryUri) {
      return null;
    }

    const currentRecord = context.registry.characters.find(
      (record) => record.id === resolvedRecord.id,
    );
    if (!currentRecord) {
      return null;
    }

    if (
      normalizeCharacterLookupKey(currentRecord.canonicalName) ===
      normalizeCharacterLookupKey(nextCanonicalName)
    ) {
      return null;
    }

    const conflictingRecord = findConflictingCharacterRecord(
      context.registry.characters,
      currentRecord.id,
      nextCanonicalName,
    );
    if (conflictingRecord) {
      throw new Error(
        `Character name "${nextCanonicalName}" is already used by "${conflictingRecord.canonicalName}" in characters.json.`,
      );
    }

    const nextRecord = renameCharacterRecord(
      currentRecord,
      nextCanonicalName,
      context.characterQuery.query,
    );
    const nextRegistry: CharacterRegistryFile = {
      version: 1,
      characters: context.registry.characters.map((record) =>
        record.id === nextRecord.id ? nextRecord : record,
      ),
    };

    const registryDocument = await vscode.workspace.openTextDocument(registryUri);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      registryUri,
      getFullDocumentRange(registryDocument),
      formatRegistryFile(nextRegistry),
    );
    return edit;
  }

  private async getRenameContext(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<CharacterRenameContext | undefined> {
    await this.index.ensureInitialized();
    await this.creativeEntityIndex.ensureInitialized();

    const match = getCharacterWordRange(document, position, this.index);
    if (!match) {
      return undefined;
    }
    const wordRange = match.range;
    const query = match.name;
    const characterQuery = this.creativeEntityIndex.queryCharacter(query, document.uri);
    if (!characterQuery?.resolved || !characterQuery.registryDefinition) {
      return undefined;
    }

    const registry = this.characterIndex.getRegistry(document.uri);
    if (!registry) {
      return undefined;
    }

    return {
      wordRange,
      characterQuery,
      registry,
    };
  }
}

export class FountainCharacterCodeActionProvider implements vscode.CodeActionProvider {
  constructor(
    private readonly index: IWorkspaceIndex,
    private readonly creativeEntityIndex: ICreativeEntityWorkspaceIndex,
  ) {}

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CodeAction[]> {
    const position = range.start;

    await this.index.ensureInitialized();
    await this.creativeEntityIndex.ensureInitialized();

    const match = getCharacterWordRange(document, position, this.index);
    if (!match) {
      return [];
    }
    const query = match.name;
    const characterQuery = this.creativeEntityIndex.queryCharacter(query, document.uri);
    if (!characterQuery?.resolved || !characterQuery.registryDefinition) {
      return [];
    }

    const title = vscode.l10n.t('neko.story.renameCharacterIdentity.action');
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.RefactorRewrite);
    action.command = {
      title,
      command: 'editor.action.rename',
    };
    action.isPreferred = true;
    return [action];
  }
}

function findConflictingCharacterRecord(
  records: readonly CharacterRecord[],
  currentRecordId: string,
  nextCanonicalName: string,
): CharacterRecord | undefined {
  const nextKey = normalizeCharacterLookupKey(nextCanonicalName);
  if (!nextKey) {
    return undefined;
  }

  return records.find((record) => {
    if (record.id === currentRecordId) {
      return false;
    }

    return collectCharacterLookupKeys(record).includes(nextKey);
  });
}

function renameCharacterRecord(
  record: CharacterRecord,
  nextCanonicalName: string,
  matchedName: string,
): CharacterRecord {
  const nextScriptNames = mergeScriptNames(
    record.bindings?.scriptNames ?? [],
    [record.canonicalName, matchedName],
    nextCanonicalName,
  );

  return {
    ...record,
    canonicalName: nextCanonicalName,
    bindings:
      nextScriptNames.length > 0 || record.bindings
        ? {
            ...record.bindings,
            scriptNames: nextScriptNames,
          }
        : record.bindings,
  };
}

function mergeScriptNames(
  currentNames: readonly string[],
  preservedNames: readonly string[],
  nextCanonicalName: string,
): readonly string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const nextCanonicalKey = normalizeCharacterLookupKey(nextCanonicalName);

  for (const candidate of [...currentNames, ...preservedNames]) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) {
      continue;
    }

    const key = normalizeCharacterLookupKey(candidate);
    if (!key || key === nextCanonicalKey || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(candidate);
  }

  return names;
}

function formatRegistryFile(registry: CharacterRegistryFile): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

function getFullDocumentRange(document: vscode.TextDocument): vscode.Range {
  const lastLineIndex = Math.max(document.lineCount - 1, 0);
  const lastLine = document.lineAt(lastLineIndex);
  return new vscode.Range(0, 0, lastLineIndex, lastLine.text.length);
}
