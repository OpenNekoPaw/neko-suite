/**
 * Mermaid Block Checker
 *
 * Checks for unclosed, malformed, or orphaned mermaid code blocks
 */

import type { ValidationError, ValidationWarning, ValidationResult } from '../types';

/**
 * Unclosed block position info
 */
export interface UnclosedBlockPosition {
  line: number;
  preview: string;
}

/**
 * Mermaid block checker interface
 */
export interface IMermaidBlockChecker {
  /**
   * Check for unclosed mermaid blocks
   */
  checkUnclosed(content: string): ValidationResult;

  /**
   * Check for malformed block closing
   */
  checkMalformed(content: string): ValidationResult;

  /**
   * Check for orphaned mermaid content outside code blocks
   */
  checkOrphaned(content: string): ValidationResult;

  /**
   * Run all checks
   */
  checkAll(content: string): ValidationResult;
}

/**
 * Mermaid block checker implementation
 */
export class MermaidBlockChecker implements IMermaidBlockChecker {
  /**
   * Run all checks
   */
  checkAll(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const unclosedResult = this.checkUnclosed(content);
    errors.push(...unclosedResult.errors);
    warnings.push(...unclosedResult.warnings);

    const malformedResult = this.checkMalformed(content);
    errors.push(...malformedResult.errors);

    const orphanedResult = this.checkOrphaned(content);
    warnings.push(...orphanedResult.warnings);

    return { errors, warnings };
  }

  /**
   * Check for unclosed mermaid code blocks
   */
  checkUnclosed(content: string): ValidationResult {
    const errors: ValidationError[] = [];

    // Count opening and closing patterns
    const openingPattern = /```mermaid\b/g;
    const closedPattern = /```mermaid\s*\n[\s\S]*?```/g;

    const openings = content.match(openingPattern) || [];
    const closed = content.match(closedPattern) || [];

    const unclosedCount = openings.length - closed.length;

    if (unclosedCount > 0) {
      // Find the position of unclosed blocks
      const positions = this.findUnclosedPositions(content);

      for (const pos of positions) {
        errors.push({
          type: 'mermaid',
          code: 'MERMAID_UNCLOSED_BLOCK',
          message: `Mermaid code block starting at line ${pos.line} is not properly closed. Missing closing \`\`\``,
          details: {
            line: pos.line,
            preview: pos.preview,
          },
        });
      }
    }

    return { errors, warnings: [] };
  }

  /**
   * Check for malformed mermaid block closing
   */
  checkMalformed(content: string): ValidationResult {
    const errors: ValidationError[] = [];
    const lines = content.split('\n');
    let inMermaidBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('```mermaid')) {
        inMermaidBlock = true;
      } else if (inMermaidBlock) {
        const closingIndex = line.indexOf('```');
        if (closingIndex !== -1) {
          const beforeClosing = line.substring(0, closingIndex).trim();
          const afterClosing = line.substring(closingIndex + 3).trim();

          if (beforeClosing.length > 0) {
            errors.push({
              type: 'mermaid',
              code: 'MERMAID_MALFORMED_CLOSING',
              message: `Mermaid code block has malformed closing at line ${i + 1}. The closing \`\`\` must be on its own line.`,
              details: {
                line: i + 1,
                lastContent: beforeClosing.substring(0, 50) + (beforeClosing.length > 50 ? '...' : ''),
                suggestion: 'Add a newline before the closing ``` marker',
              },
            });
          } else if (afterClosing.length > 0) {
            errors.push({
              type: 'mermaid',
              code: 'MERMAID_INLINE_CLOSING',
              message: `Mermaid code block closing \`\`\` is immediately followed by content at line ${i + 1}. Add a newline after \`\`\`.`,
              details: {
                line: i + 1,
                afterContent: afterClosing.substring(0, 50),
                suggestion: 'The closing ``` should be on its own line with nothing after it',
              },
            });
          }

          inMermaidBlock = false;
        } else {
          // Check for partial backticks (`` instead of ```)
          const partialBacktickMatch = line.match(/([^`]|^)``([^`]|$)/);
          if (partialBacktickMatch) {
            errors.push({
              type: 'mermaid',
              code: 'MERMAID_MALFORMED_CLOSING',
              message: `Mermaid code block at line ${i + 1} may have incorrect backticks (two instead of three).`,
              details: {
                line: i + 1,
                content: line.substring(0, 80),
                suggestion: 'Use three backticks to close the code block',
              },
            });
          }
        }
      }
    }

    return { errors, warnings: [] };
  }

  /**
   * Check for mermaid content outside of code blocks
   */
  checkOrphaned(content: string): ValidationResult {
    const warnings: ValidationWarning[] = [];
    const lines = content.split('\n');
    let inCodeBlock = false;

    const mermaidKeywords = [
      'graph ',
      'graph\t',
      'flowchart ',
      'sequenceDiagram',
      'classDiagram',
      'stateDiagram',
      'erDiagram',
      'gantt',
      'pie ',
      'pie\t',
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) continue;

      for (const keyword of mermaidKeywords) {
        if (
          trimmedLine.startsWith(keyword) ||
          trimmedLine.toLowerCase().startsWith(keyword.toLowerCase())
        ) {
          warnings.push({
            type: 'mermaid',
            code: 'MERMAID_OUTSIDE_CODEBLOCK',
            message: `Possible Mermaid diagram content found outside of code block at line ${i + 1}`,
            suggestion: 'Wrap Mermaid diagrams in ```mermaid and ``` markers',
          });
          break;
        }
      }
    }

    return { errors: [], warnings };
  }

  /**
   * Find positions of unclosed mermaid blocks
   */
  private findUnclosedPositions(content: string): UnclosedBlockPosition[] {
    const positions: UnclosedBlockPosition[] = [];
    const lines = content.split('\n');

    let inMermaidBlock = false;
    let blockStartLine = 0;
    let blockContent = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';

      if (!inMermaidBlock && line.trim().startsWith('```mermaid')) {
        inMermaidBlock = true;
        blockStartLine = i + 1;
        blockContent = '';
      } else if (inMermaidBlock) {
        if (line.trim() === '```') {
          inMermaidBlock = false;
          blockContent = '';
        } else {
          blockContent += line + '\n';
        }
      }
    }

    if (inMermaidBlock) {
      positions.push({
        line: blockStartLine,
        preview: blockContent.substring(0, 100) + (blockContent.length > 100 ? '...' : ''),
      });
    }

    return positions;
  }
}

/**
 * Create a mermaid block checker instance
 */
export function createMermaidBlockChecker(): IMermaidBlockChecker {
  return new MermaidBlockChecker();
}
