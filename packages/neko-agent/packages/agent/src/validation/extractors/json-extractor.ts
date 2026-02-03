/**
 * JSON Block Extractor
 *
 * Extracts JSON content from code blocks or raw JSON
 */

import type { JsonBlockInfo } from '../types';

/**
 * JSON block extractor interface
 */
export interface IJsonExtractor {
  /**
   * Extract JSON blocks with position info
   */
  extractWithPosition(content: string): JsonBlockInfo[];

  /**
   * Extract first valid JSON from content
   */
  extractFirst(content: string): unknown | null;
}

/**
 * JSON block extractor implementation
 */
export class JsonExtractor implements IJsonExtractor {
  /**
   * Extract JSON blocks with position info
   */
  extractWithPosition(content: string): JsonBlockInfo[] {
    const blocks: JsonBlockInfo[] = [];

    // Pattern 1: JSON in code blocks (```json ... ```)
    const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/g;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const innerContent = match[1]?.trim() || '';
      const startIndex = match.index;
      const endIndex = match.index + fullMatch.length;

      // Try to parse as JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(innerContent);
      } catch {
        // Not valid JSON, skip
        continue;
      }

      // Calculate line numbers
      const beforeContent = content.substring(0, startIndex);
      const lineStart = (beforeContent.match(/\n/g) || []).length + 1;
      const blockLines = (fullMatch.match(/\n/g) || []).length;
      const lineEnd = lineStart + blockLines;

      blocks.push({
        content: innerContent,
        parsed,
        startIndex,
        endIndex,
        lineStart,
        lineEnd,
        inCodeBlock: true,
      });
    }

    // Pattern 2: Raw JSON objects/arrays (if no code blocks found)
    if (blocks.length === 0) {
      const rawJsonRegex = /(\{[\s\S]*?\}|\[[\s\S]*?\])/g;
      while ((match = rawJsonRegex.exec(content)) !== null) {
        const jsonStr = match[1] || '';
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const startIndex = match.index;
        const endIndex = match.index + jsonStr.length;
        const beforeContent = content.substring(0, startIndex);
        const lineStart = (beforeContent.match(/\n/g) || []).length + 1;
        const blockLines = (jsonStr.match(/\n/g) || []).length;
        const lineEnd = lineStart + blockLines;

        blocks.push({
          content: jsonStr,
          parsed,
          startIndex,
          endIndex,
          lineStart,
          lineEnd,
          inCodeBlock: false,
        });
      }
    }

    return blocks;
  }

  /**
   * Extract first valid JSON from content (handles code blocks and raw JSON)
   */
  extractFirst(content: string): unknown | null {
    // Try to extract from code block first
    const jsonBlockMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)```/);
    const jsonContent = jsonBlockMatch ? jsonBlockMatch[1]?.trim() : content.trim();

    if (!jsonContent) {
      return null;
    }

    try {
      return JSON.parse(jsonContent);
    } catch {
      // Try to find JSON object/array in content
      const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch?.[1]) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

/**
 * Create a JSON extractor instance
 */
export function createJsonExtractor(): IJsonExtractor {
  return new JsonExtractor();
}
