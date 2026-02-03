/**
 * Mermaid Block Extractor
 *
 * Extracts Mermaid diagram code blocks from content
 */

import type { MermaidBlockInfo } from '../types';

/**
 * Mermaid block extractor interface
 */
export interface IMermaidExtractor {
  /**
   * Extract mermaid code blocks as strings
   */
  extract(content: string): string[];

  /**
   * Extract mermaid blocks with position info
   */
  extractWithPosition(content: string): MermaidBlockInfo[];
}

/**
 * Mermaid block extractor implementation
 */
export class MermaidExtractor implements IMermaidExtractor {
  /**
   * Extract mermaid code blocks from content
   */
  extract(content: string): string[] {
    const blocks: string[] = [];
    // Match mermaid blocks - allow closing ``` to be on same line (malformed) or new line
    const regex = /```mermaid\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        blocks.push(match[1].trim());
      }
    }

    return blocks;
  }

  /**
   * Extract mermaid blocks with position info
   */
  extractWithPosition(content: string): MermaidBlockInfo[] {
    const blocks: MermaidBlockInfo[] = [];
    const regex = /```mermaid\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const fullMatch = match[0];
      const innerContent = match[1]?.trim() || '';
      const startIndex = match.index;
      const endIndex = match.index + fullMatch.length;

      // Calculate line numbers
      const beforeContent = content.substring(0, startIndex);
      const lineStart = (beforeContent.match(/\n/g) || []).length + 1;
      const blockLines = (fullMatch.match(/\n/g) || []).length;
      const lineEnd = lineStart + blockLines;

      blocks.push({
        content: innerContent,
        startIndex,
        endIndex,
        lineStart,
        lineEnd,
      });
    }

    return blocks;
  }
}

/**
 * Create a mermaid extractor instance
 */
export function createMermaidExtractor(): IMermaidExtractor {
  return new MermaidExtractor();
}
