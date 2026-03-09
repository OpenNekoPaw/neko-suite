import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { Character, SceneHeading, Dialogue } from '@neko-story/types';
import type { IWorkspaceIndex } from '../services/types';

/**
 * Provides hover information for Fountain files.
 * Uses IWorkspaceIndex for cross-file character statistics.
 * Scene stats remain per-file (scene content is local).
 */
export class FountainHoverProvider implements vscode.HoverProvider {
  constructor(private readonly index: IWorkspaceIndex) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    const line = document.lineAt(position.line).text;

    await this.index.ensureInitialized();

    // Use indexed document if available, otherwise parse on the fly
    const fountainDoc = this.index.getDocument(document.uri) ?? parse(document.getText());

    // Check if hovering over a character name
    const charMatch = /^([A-Z][A-Z0-9 ._\-']+)(?:\s*\([^)]+\))?(\s*\^)?$/.exec(line);
    if (charMatch) {
      const charName = charMatch[1]?.trim();
      if (charName) {
        const localStats = this.getLocalCharacterStats(fountainDoc, charName);
        const crossFileStats = this.getCrossFileCharacterStats(charName);
        if (localStats) {
          return new vscode.Hover(this.formatCharacterStats(charName, localStats, crossFileStats));
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

  private getLocalCharacterStats(
    doc: { elements: Array<{ type: string }> },
    name: string,
  ): LocalCharacterStats | null {
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
          (e) =>
            e.type === 'character' && (e as Character).range.start.line < dialogue.range.start.line,
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

  private getCrossFileCharacterStats(name: string): CrossFileCharacterStats {
    const locations = this.index.findCharacterLocations(name);
    const fileSet = new Set<string>();
    for (const loc of locations) {
      fileSet.add(loc.uri.toString());
    }
    return {
      totalAppearances: locations.length,
      fileCount: fileSet.size,
    };
  }

  private getSceneStats(
    doc: { elements: Array<{ type: string }> },
    lineNum: number,
  ): SceneStats | null {
    let currentScene: SceneHeading | null = null;
    const characters = new Set<string>();
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

  private formatCharacterStats(
    name: string,
    local: LocalCharacterStats,
    crossFile: CrossFileCharacterStats,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${name}\n\n`);
    md.appendMarkdown(`| Stat | Value |\n|------|-------|\n`);
    md.appendMarkdown(`| Appearances (this file) | ${local.appearances} |\n`);
    md.appendMarkdown(`| Dialogue lines (this file) | ${local.dialogueLines} |\n`);
    md.appendMarkdown(`| First appearance | Line ${local.firstAppearance + 1} |\n`);
    md.appendMarkdown(`| Last appearance | Line ${local.lastAppearance + 1} |\n`);

    // Cross-file stats (only show if more than 1 file)
    if (crossFile.fileCount > 1) {
      md.appendMarkdown(
        `| **Total appearances** | **${crossFile.totalAppearances} in ${crossFile.fileCount} files** |\n`,
      );
    }

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

interface LocalCharacterStats {
  appearances: number;
  dialogueLines: number;
  firstAppearance: number;
  lastAppearance: number;
}

interface CrossFileCharacterStats {
  totalAppearances: number;
  fileCount: number;
}

interface SceneStats {
  location: string;
  intExt: string | null;
  time: string | null;
  characters: string[];
  dialogueCount: number;
}
