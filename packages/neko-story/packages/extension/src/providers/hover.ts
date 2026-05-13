import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import type { Character, SceneHeading, Dialogue } from '@neko-story/types';
import type {
  CharacterEntityStats,
  ICreativeEntityWorkspaceIndex,
  ResolvedCharacterMatch,
  SceneEntityQuery,
  IWorkspaceIndex,
} from '../services/types';

/**
 * Provides hover information for Fountain files.
 * Uses IWorkspaceIndex for cross-file character statistics.
 * Scene stats remain per-file (scene content is local).
 */
export class FountainHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly index: IWorkspaceIndex,
    private readonly creativeEntityIndex?: ICreativeEntityWorkspaceIndex,
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    const line = document.lineAt(position.line).text;

    await this.index.ensureInitialized();
    await this.creativeEntityIndex?.ensureInitialized();

    // Use indexed document if available, otherwise parse on the fly
    const fountainDoc = this.index.getDocument(document.uri) ?? parse(document.getText());

    // Check if hovering over a character name (English ALL-CAPS or CJK)
    const charMatch =
      /^([A-Z][A-Z0-9 ._\-']+)(?:\s*\([^)]+\))?(\s*\^)?$/.exec(line) ??
      /^([一-鿿㐀-䶿][一-鿿㐀-䶿·]{0,9})(?:\s*[（(][^)）]+[)）])?(\s*\^)?$/.exec(line);
    if (charMatch) {
      const charName = charMatch[1]?.trim();
      if (charName) {
        const characterQuery = this.creativeEntityIndex?.queryCharacter(charName, document.uri);
        const referenceNames =
          characterQuery?.referenceNames.length && characterQuery.referenceNames[0]
            ? characterQuery.referenceNames
            : [charName];
        const localStats = this.getLocalCharacterStats(fountainDoc, referenceNames);
        const crossFileStats = characterQuery
          ? {
              totalAppearances: characterQuery.stats.totalScriptReferences,
              fileCount: characterQuery.stats.fileCount,
            }
          : this.getCrossFileCharacterStats(referenceNames);

        if (localStats || characterQuery?.resolved) {
          return new vscode.Hover(
            this.formatCharacterStats(
              characterQuery?.resolved?.record.displayName ??
                characterQuery?.resolved?.record.canonicalName ??
                charName,
              localStats,
              crossFileStats,
              characterQuery?.resolved,
              characterQuery?.stats,
            ),
          );
        }
      }
    }

    // Check if hovering over a scene heading (English or CJK)
    const sceneMatch =
      /^(\.|\s*(?:INT|EXT|EST|INT\.?\/EXT|I\.?\/E|内景|內景|外景|内外景|內外景)[.\s\u3000])/i.exec(
        line,
      );
    if (sceneMatch) {
      // Try cross-modal scene query first
      const sceneQuery = this.creativeEntityIndex?.queryScene(line.trim(), document.uri);
      if (sceneQuery) {
        return new vscode.Hover(this.formatSceneEntityStats(sceneQuery));
      }
      // Fallback to local-only stats
      const sceneStats = this.getSceneStats(fountainDoc, position.line);
      if (sceneStats) {
        return new vscode.Hover(this.formatSceneStats(sceneStats));
      }
    }

    return null;
  }

  private getLocalCharacterStats(
    doc: { elements: Array<{ type: string }> },
    names: readonly string[],
  ): LocalCharacterStats | null {
    const nameSet = new Set(names);
    let appearances = 0;
    let dialogueLines = 0;
    let firstAppearance = -1;
    let lastAppearance = -1;

    for (const element of doc.elements) {
      if (element.type === 'character') {
        const char = element as Character;
        if (nameSet.has(char.name)) {
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
        if (lastChar && nameSet.has(lastChar.name)) {
          dialogueLines++;
        }
      }
    }

    if (appearances === 0) return null;

    return { appearances, dialogueLines, firstAppearance, lastAppearance };
  }

  private getCrossFileCharacterStats(names: readonly string[]): CrossFileCharacterStats {
    const deduped = new Map<string, string>();

    for (const name of names) {
      const locations = this.index.findCharacterLocations(name);
      for (const loc of locations) {
        const key = [
          loc.uri.toString(),
          loc.range.start.line,
          loc.range.start.character,
          loc.range.end.line,
          loc.range.end.character,
        ].join(':');
        if (!deduped.has(key)) {
          deduped.set(key, loc.uri.toString());
        }
      }
    }

    const fileSet = new Set<string>();
    for (const uri of deduped.values()) {
      fileSet.add(uri);
    }

    return {
      totalAppearances: deduped.size,
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
    local: LocalCharacterStats | null,
    crossFile: CrossFileCharacterStats,
    resolved?: Pick<ResolvedCharacterMatch, 'record'>,
    entityStats?: CharacterEntityStats,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${name}\n\n`);

    if (resolved) {
      md.appendMarkdown(`**Registry ID:** \`${resolved.record.id}\`\n\n`);
      md.appendMarkdown(`**Canonical Name:** ${resolved.record.canonicalName}\n\n`);

      if (resolved.record.displayName) {
        md.appendMarkdown(`**Display Name:** ${resolved.record.displayName}\n\n`);
      }
      if (resolved.record.aliases.length > 0) {
        md.appendMarkdown(`**Aliases:** ${resolved.record.aliases.join(', ')}\n\n`);
      }
      if (resolved.record.metadata?.role) {
        md.appendMarkdown(`**Role:** ${resolved.record.metadata.role}\n\n`);
      }
      md.appendMarkdown(`**Status:** ${resolved.record.status}\n\n`);
    }

    if (local) {
      md.appendMarkdown(`| Stat | Value |\n|------|-------|\n`);
      md.appendMarkdown(`| Appearances (this file) | ${local.appearances} |\n`);
      md.appendMarkdown(`| Dialogue lines (this file) | ${local.dialogueLines} |\n`);
      md.appendMarkdown(`| First appearance | Line ${local.firstAppearance + 1} |\n`);
      md.appendMarkdown(`| Last appearance | Line ${local.lastAppearance + 1} |\n`);
    }

    // Cross-file stats (only show if more than 1 file)
    if (crossFile.fileCount > 1 && local) {
      md.appendMarkdown(
        `| **Total appearances** | **${crossFile.totalAppearances} in ${crossFile.fileCount} files** |\n`,
      );
    } else if (crossFile.fileCount > 1) {
      md.appendMarkdown(
        `**Total appearances:** ${crossFile.totalAppearances} in ${crossFile.fileCount} files\n`,
      );
    }

    // Cross-modal stats (canvas/asset/generated)
    const hasModalStats =
      entityStats?.canvasNodeCount || entityStats?.assetCount || entityStats?.generatedAssetCount;
    if (hasModalStats) {
      md.appendMarkdown(`\n---\n\n`);
      if (entityStats.canvasNodeCount) {
        md.appendMarkdown(`Canvas nodes: **${entityStats.canvasNodeCount}**\n\n`);
      }
      if (entityStats.assetCount) {
        md.appendMarkdown(`Asset entities: **${entityStats.assetCount}**\n\n`);
      }
      if (entityStats.generatedAssetCount) {
        md.appendMarkdown(`Generated assets: **${entityStats.generatedAssetCount}**\n\n`);
      }
    }

    return md;
  }

  private formatSceneEntityStats(query: SceneEntityQuery): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### Scene: ${query.location}\n\n`);
    if (query.intExt || query.timeOfDay) {
      md.appendMarkdown(`**${[query.intExt, query.timeOfDay].filter(Boolean).join(' - ')}**\n\n`);
    }
    md.appendMarkdown(`**Scene ID:** \`${query.sceneId}\`\n\n`);
    md.appendMarkdown(`**Characters:** ${query.sceneCharacters.join(', ') || 'None'}\n\n`);
    if (query.stats.estimatedDuration > 0) {
      md.appendMarkdown(`**Est. duration:** ${query.stats.estimatedDuration}s\n\n`);
    }
    if (query.stats.fileCount > 1) {
      md.appendMarkdown(
        `**Location used in** ${query.stats.totalScriptOccurrences} scenes across ${query.stats.fileCount} files\n\n`,
      );
    }

    const hasModalStats = query.stats.canvasNodeCount || query.stats.shotCount;
    if (hasModalStats) {
      md.appendMarkdown(`\n---\n\n`);
      if (query.stats.canvasNodeCount) {
        md.appendMarkdown(`Canvas scene nodes: **${query.stats.canvasNodeCount}**\n\n`);
      }
      if (query.stats.shotCount) {
        md.appendMarkdown(`Canvas shots: **${query.stats.shotCount}**\n\n`);
      }
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
