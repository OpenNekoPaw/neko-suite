/**
 * Mermaid Syntax Validator
 *
 * Validates Mermaid diagram syntax using mermaid library or fallback
 */

import type { MermaidValidationResult } from '../types';

/**
 * Mermaid diagram types and their starting keywords
 */
const MERMAID_DIAGRAM_TYPES = [
  'graph',
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
  'requirement',
  'c4Context',
  'sankey',
  'xychart',
  'block',
] as const;

/**
 * Mermaid module type for dynamic import
 */
type MermaidModule = {
  default: {
    parse: (text: string, parseOptions?: { suppressErrors?: boolean }) => Promise<unknown>;
    initialize: (config: Record<string, unknown>) => void;
  };
};

/**
 * Cached mermaid module
 */
let mermaidModule: MermaidModule | null = null;
let mermaidLoadFailed = false;

/**
 * Mermaid validator interface
 */
export interface IMermaidValidator {
  /**
   * Validate mermaid diagram code
   */
  validate(code: string): Promise<MermaidValidationResult>;

  /**
   * Check if mermaid library is available
   */
  isLibraryAvailable(): Promise<boolean>;
}

/**
 * Mermaid syntax validator implementation
 */
export class MermaidValidator implements IMermaidValidator {
  /**
   * Validate mermaid diagram code
   */
  async validate(code: string): Promise<MermaidValidationResult> {
    const mermaid = await this.loadMermaid();

    if (mermaid) {
      return this.validateWithLibrary(mermaid, code);
    } else {
      return this.validateBasic(code);
    }
  }

  /**
   * Check if mermaid library is available
   */
  async isLibraryAvailable(): Promise<boolean> {
    const mermaid = await this.loadMermaid();
    return mermaid !== null;
  }

  /**
   * Load mermaid module dynamically
   */
  private async loadMermaid(): Promise<MermaidModule['default'] | null> {
    if (mermaidLoadFailed) {
      return null;
    }

    if (mermaidModule) {
      return mermaidModule.default;
    }

    try {
      // Dynamic import for optional dependency
      mermaidModule = (await import('mermaid')) as MermaidModule;

      // Initialize with secure settings
      mermaidModule.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
      });

      return mermaidModule.default;
    } catch {
      // Mermaid not available (likely Node.js without browser environment)
      mermaidLoadFailed = true;
      return null;
    }
  }

  /**
   * Validate mermaid code with library
   */
  private async validateWithLibrary(
    mermaid: MermaidModule['default'],
    code: string
  ): Promise<MermaidValidationResult> {
    try {
      await mermaid.parse(code);
      return { valid: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown parse error';
      return {
        valid: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Basic mermaid syntax validation (fallback when library unavailable)
   */
  private validateBasic(code: string): MermaidValidationResult {
    const trimmedCode = code.trim();
    const lines = trimmedCode.split('\n');
    const firstLine = lines[0]?.trim() || '';

    // Check if starts with valid diagram type
    const startsWithValidType = MERMAID_DIAGRAM_TYPES.some(
      (type) =>
        firstLine.startsWith(type) ||
        firstLine.toLowerCase().startsWith(type.toLowerCase())
    );

    if (!startsWithValidType) {
      return {
        valid: false,
        error: `Invalid diagram type. Must start with one of: ${MERMAID_DIAGRAM_TYPES.slice(0, 5).join(', ')}...`,
        lineNumber: 1,
      };
    }

    // Check for common syntax issues
    const syntaxIssue = this.checkCommonIssues(trimmedCode);
    if (syntaxIssue) {
      return syntaxIssue;
    }

    return { valid: true };
  }

  /**
   * Check for common mermaid syntax issues
   */
  private checkCommonIssues(code: string): MermaidValidationResult | null {
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || '';
      const lineNum = i + 1;

      // Check for unmatched brackets
      const openBrackets = (line.match(/\[/g) || []).length;
      const closeBrackets = (line.match(/\]/g) || []).length;
      if (openBrackets !== closeBrackets) {
        return {
          valid: false,
          error: `Unmatched brackets on line ${lineNum}`,
          lineNumber: lineNum,
        };
      }

      // Check for unmatched parentheses
      const openParens = (line.match(/\(/g) || []).length;
      const closeParens = (line.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        return {
          valid: false,
          error: `Unmatched parentheses on line ${lineNum}`,
          lineNumber: lineNum,
        };
      }

      // Check for unmatched quotes
      const doubleQuotes = (line.match(/"/g) || []).length;
      if (doubleQuotes % 2 !== 0) {
        return {
          valid: false,
          error: `Unmatched double quotes on line ${lineNum}`,
          lineNumber: lineNum,
        };
      }
    }

    return null;
  }
}

/**
 * Create a mermaid validator instance
 */
export function createMermaidValidator(): IMermaidValidator {
  return new MermaidValidator();
}
