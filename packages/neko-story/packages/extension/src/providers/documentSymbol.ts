import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { SceneHeading, Section, Character, AnyFountainElement } from '@neko-story/types';

/**
 * Provides document symbols for Fountain files (outline view)
 */
export class FountainDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const text = document.getText();
    const fountainDoc = parse(text);
    const symbols: vscode.DocumentSymbol[] = [];

    // Track section hierarchy
    const sectionStack: { level: number; symbol: vscode.DocumentSymbol }[] = [];

    for (const element of fountainDoc.elements) {
      const symbol = this.createSymbol(element, document);
      if (!symbol) continue;

      if (element.type === 'section') {
        const section = element as Section;
        // Pop sections of same or higher level
        while (sectionStack.length > 0) {
          const top = sectionStack[sectionStack.length - 1];
          if (top && top.level >= section.level) {
            sectionStack.pop();
          } else {
            break;
          }
        }

        // Add to parent or root
        if (sectionStack.length > 0) {
          const parent = sectionStack[sectionStack.length - 1];
          parent?.symbol.children.push(symbol);
        } else {
          symbols.push(symbol);
        }

        sectionStack.push({ level: section.level, symbol });
      } else if (element.type === 'scene_heading') {
        // Scene headings go under current section or root
        if (sectionStack.length > 0) {
          const parent = sectionStack[sectionStack.length - 1];
          parent?.symbol.children.push(symbol);
        } else {
          symbols.push(symbol);
        }
      }
    }

    return symbols;
  }

  private createSymbol(
    element: AnyFountainElement,
    document: vscode.TextDocument
  ): vscode.DocumentSymbol | null {
    const range = new vscode.Range(
      element.range.start.line,
      element.range.start.character,
      element.range.end.line,
      element.range.end.character
    );

    switch (element.type) {
      case 'section': {
        const section = element as Section;
        return new vscode.DocumentSymbol(
          section.text,
          '',
          vscode.SymbolKind.Namespace,
          range,
          range
        );
      }
      case 'scene_heading': {
        const scene = element as SceneHeading;
        const label = scene.location || scene.raw;
        const detail = [scene.intExt, scene.time].filter(Boolean).join(' - ');
        return new vscode.DocumentSymbol(
          label,
          detail,
          vscode.SymbolKind.Function,
          range,
          range
        );
      }
      default:
        return null;
    }
  }
}

/**
 * Collects all unique character names from a document
 */
export function collectCharacters(document: vscode.TextDocument): string[] {
  const text = document.getText();
  const fountainDoc = parse(text);
  const characters = new Set<string>();

  for (const element of fountainDoc.elements) {
    if (element.type === 'character') {
      const char = element as Character;
      characters.add(char.name);
    }
  }

  return Array.from(characters).sort();
}
