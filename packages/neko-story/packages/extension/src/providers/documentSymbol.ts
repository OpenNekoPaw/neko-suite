import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type {
  SceneHeading,
  Section,
  Character,
  Transition,
  Synopsis,
  Lyrics,
  Note,
  AnyFountainElement,
} from '@neko-story/types';

/** Element types that appear as child nodes in the outline */
const CHILD_ELEMENT_TYPES = new Set([
  'character',
  'transition',
  'synopsis',
  'lyrics',
  'page_break',
  'note',
]);

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
    // Track current scene heading symbol (for attaching child elements)
    let currentSceneSymbol: vscode.DocumentSymbol | null = null;
    // Track character dedup per scene scope (reset on new scene/section)
    let sceneCharacters = new Set<string>();

    for (const element of fountainDoc.elements) {
      if (element.type === 'section') {
        const section = element as Section;
        const symbol = this.createSymbol(element, document);
        if (!symbol) continue;

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
        // Reset scene context when entering a new section
        currentSceneSymbol = null;
        sceneCharacters = new Set<string>();
      } else if (element.type === 'scene_heading') {
        const symbol = this.createSymbol(element, document);
        if (!symbol) continue;

        // Scene headings go under current section or root
        if (sectionStack.length > 0) {
          const parent = sectionStack[sectionStack.length - 1];
          parent?.symbol.children.push(symbol);
        } else {
          symbols.push(symbol);
        }

        currentSceneSymbol = symbol;
        sceneCharacters = new Set<string>();
      } else if (CHILD_ELEMENT_TYPES.has(element.type)) {
        // Deduplicate characters within the same scene/section scope
        if (element.type === 'character') {
          const char = element as Character;
          if (sceneCharacters.has(char.name)) {
            continue;
          }
          sceneCharacters.add(char.name);
        }

        const symbol = this.createSymbol(element, document);
        if (!symbol) continue;

        // Attach to current scene, or current section, or root
        if (currentSceneSymbol) {
          currentSceneSymbol.children.push(symbol);
        } else if (sectionStack.length > 0) {
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
    _document: vscode.TextDocument
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
      case 'character': {
        const char = element as Character;
        const detail = char.extension ? `(${char.extension})` : '';
        return new vscode.DocumentSymbol(
          char.name,
          detail,
          vscode.SymbolKind.Variable,
          range,
          range
        );
      }
      case 'transition': {
        const transition = element as Transition;
        return new vscode.DocumentSymbol(
          transition.text,
          '',
          vscode.SymbolKind.Event,
          range,
          range
        );
      }
      case 'synopsis': {
        const synopsis = element as Synopsis;
        return new vscode.DocumentSymbol(
          synopsis.text,
          'synopsis',
          vscode.SymbolKind.String,
          range,
          range
        );
      }
      case 'lyrics': {
        const lyrics = element as Lyrics;
        return new vscode.DocumentSymbol(
          lyrics.text,
          'lyrics',
          vscode.SymbolKind.String,
          range,
          range
        );
      }
      case 'page_break': {
        return new vscode.DocumentSymbol(
          '═══',
          'page break',
          vscode.SymbolKind.Operator,
          range,
          range
        );
      }
      case 'note': {
        const note = element as Note;
        return new vscode.DocumentSymbol(
          note.text,
          'note',
          vscode.SymbolKind.String,
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
