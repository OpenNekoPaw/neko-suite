import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { Character, SceneHeading, Dialogue } from '@neko-story/types';

/**
 * Provides hover information for Fountain files
 */
export class FountainHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.Hover> {
    const line = document.lineAt(position.line).text;
    const text = document.getText();
    const fountainDoc = parse(text);

    // Check if hovering over a character name
    const charMatch = /^([A-Z][A-Z0-9 ._\-']+)(?:\s*\([^)]+\))?(\s*\^)?$/.exec(line);
    if (charMatch) {
      const charName = charMatch[1]?.trim();
      if (charName) {
        const stats = this.getCharacterStats(fountainDoc, charName);
        if (stats) {
          return new vscode.Hover(this.formatCharacterStats(charName, stats));
        }
      }
    }

    // Check if hovering over a scene heading
    const sceneMatch = /^(\.|\s*(?:INT|EXT|EST|INT\.?\/EXT|I\.?\/E)[\.\s])/i.exec(line);
    if (sceneMatch) {
      const sceneStats = this.getSceneStats(fountainDoc, position.line);
      if (sceneStats) {
        return new vscode.Hover(this.formatSceneStats(sceneStats));
      }
    }

    return null;
  }

  private getCharacterStats(
    doc: { elements: Array<{ type: string }> },
    name: string
  ): CharacterStats | null {
    let appearances = 0;
    let dialogueLines = 0;
    let firstAppearance = -1;
    let lastAppearance = -1;

    for (const element of doc.elements) {
      if (element.type === 'character') {
        const char = element as Character;
        if (char.name === name) {
          appearances++;
          if (firstAppearance === -1) {
            firstAppearance = char.range.start.line;
          }
          lastAppearance = char.range.start.line;
        }
      }
      if (element.type === 'dialogue') {
        const dialogue = element as Dialogue;
        // Count dialogue lines for the character (simplified)
        const prevElements = doc.elements.filter(
          e => e.type === 'character' && (e as Character).range.start.line < dialogue.range.start.line
        );
        const lastChar = prevElements[prevElements.length - 1] as Character | undefined;
        if (lastChar?.name === name) {
          dialogueLines++;
        }
      }
    }

    if (appearances === 0) return null;

    return { appearances, dialogueLines, firstAppearance, lastAppearance };
  }

  private getSceneStats(
    doc: { elements: Array<{ type: string }> },
    lineNum: number
  ): SceneStats | null {
    let currentScene: SceneHeading | null = null;
    let characters = new Set<string>();
    let dialogueCount = 0;

    for (const element of doc.elements) {
      if (element.type === 'scene_heading') {
        const scene = element as SceneHeading;
        if (scene.range.start.line === lineNum) {
          currentScene = scene;
        } else if (currentScene && scene.range.start.line > lineNum) {
          break;
        }
      }

      if (currentScene) {
        if (element.type === 'character') {
          const char = element as Character;
          characters.add(char.name);
        }
        if (element.type === 'dialogue') {
          dialogueCount++;
        }
      }
    }

    if (!currentScene) return null;

    return {
      location: currentScene.location,
      intExt: currentScene.intExt,
      time: currentScene.time,
      characters: Array.from(characters),
      dialogueCount,
    };
  }

  private formatCharacterStats(name: string, stats: CharacterStats): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${name}\n\n`);
    md.appendMarkdown(`| Stat | Value |\n|------|-------|\n`);
    md.appendMarkdown(`| Appearances | ${stats.appearances} |\n`);
    md.appendMarkdown(`| Dialogue lines | ${stats.dialogueLines} |\n`);
    md.appendMarkdown(`| First appearance | Line ${stats.firstAppearance + 1} |\n`);
    md.appendMarkdown(`| Last appearance | Line ${stats.lastAppearance + 1} |\n`);
    return md;
  }

  private formatSceneStats(stats: SceneStats): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### Scene: ${stats.location}\n\n`);
    if (stats.intExt || stats.time) {
      md.appendMarkdown(`**${[stats.intExt, stats.time].filter(Boolean).join(' - ')}**\n\n`);
    }
    md.appendMarkdown(`**Characters:** ${stats.characters.join(', ') || 'None'}\n\n`);
    md.appendMarkdown(`**Dialogue lines:** ${stats.dialogueCount}\n`);
    return md;
  }
}

interface CharacterStats {
  appearances: number;
  dialogueLines: number;
  firstAppearance: number;
  lastAppearance: number;
}

interface SceneStats {
  location: string;
  intExt: string | null;
  time: string | null;
  characters: string[];
  dialogueCount: number;
}
