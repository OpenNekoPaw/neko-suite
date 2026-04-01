/**
 * Creative Version Log — Track AI generation iterations and user evaluations
 *
 * Records each AI generation's parameters, results, and user satisfaction
 * signals to support creative version tracking and rollback.
 *
 * Pure state container with no external dependencies.
 */

import type { CreativeVersionEntry } from '@neko/shared';

// =============================================================================
// Constants
// =============================================================================

/** Tool name patterns that indicate a creative generation tool */
const GENERATION_TOOL_PATTERNS = [
  /^generate/i,
  /^render/i,
  /^create_image/i,
  /^create_video/i,
  /^create_audio/i,
  /^create_music/i,
  /^compose/i,
  /^synthesize/i,
];

/** Keywords that signal user approval (version anchor) */
const APPROVAL_KEYWORDS = [
  '这版不错',
  '满意',
  '就这样',
  'OK',
  '完美',
  '可以',
  'keep this',
  'looks good',
  'perfect',
  'love it',
  'approved',
  'great',
  'nice',
];

/** Keywords that signal user rejection */
const REJECTION_KEYWORDS = [
  '不行',
  '不好',
  '重做',
  '重新',
  '换一个',
  'redo',
  'try again',
  'not good',
  "doesn't work",
  'rejected',
  'no good',
];

// =============================================================================
// Type: Record input (without auto-generated fields)
// =============================================================================

/** Input for recording a new version entry */
export interface VersionRecordInput {
  toolName: string;
  toolCallId: string;
  parameters: Record<string, unknown>;
  resultPath?: string;
  resultSuccess: boolean;
  timestamp: number;
}

// =============================================================================
// CreativeVersionLog
// =============================================================================

export class CreativeVersionLog {
  private _entries: CreativeVersionEntry[] = [];
  private _nextIndex = 0;

  /** Number of recorded entries */
  get size(): number {
    return this._entries.length;
  }

  /**
   * Record a new version entry from a generation tool result.
   */
  record(input: VersionRecordInput): CreativeVersionEntry {
    const entry: CreativeVersionEntry = {
      id: `v_${input.timestamp}_${this._nextIndex}`,
      toolName: input.toolName,
      toolCallId: input.toolCallId,
      parameters: input.parameters,
      resultPath: input.resultPath,
      resultSuccess: input.resultSuccess,
      timestamp: input.timestamp,
      iterationIndex: this._nextIndex,
    };
    this._entries.push(entry);
    this._nextIndex++;
    return entry;
  }

  /**
   * Update the evaluation on an existing entry.
   * Returns true if the entry was found and updated.
   */
  evaluate(
    entryId: string,
    evaluation: 'approved' | 'rejected' | 'revised',
    note?: string,
  ): boolean {
    const entry = this._entries.find((e) => e.id === entryId);
    if (!entry) return false;
    entry.userEvaluation = evaluation;
    if (note !== undefined) {
      entry.evaluationNote = note;
    }
    return true;
  }

  /**
   * Evaluate the most recent entry (convenience for keyword-based triggers).
   */
  evaluateLatest(evaluation: 'approved' | 'rejected' | 'revised', note?: string): boolean {
    const latest = this._entries[this._entries.length - 1];
    if (!latest) return false;
    return this.evaluate(latest.id, evaluation, note);
  }

  /** Find entry by ID */
  findById(id: string): CreativeVersionEntry | undefined {
    return this._entries.find((e) => e.id === id);
  }

  /** Get entries filtered by tool name */
  getByTool(toolName: string): CreativeVersionEntry[] {
    return this._entries.filter((e) => e.toolName === toolName);
  }

  /** Get entries with approved evaluation */
  getApproved(): CreativeVersionEntry[] {
    return this._entries.filter((e) => e.userEvaluation === 'approved');
  }

  /** Get the N most recent entries (default: all) */
  getLatest(n?: number): CreativeVersionEntry[] {
    if (n === undefined) return [...this._entries];
    return this._entries.slice(-n);
  }

  /**
   * Generate a human-readable summary of recent versions
   * for context injection into the system prompt.
   */
  toSummary(maxEntries = 5): string {
    if (this._entries.length === 0) return '';

    const recent = this._entries.slice(-maxEntries);
    const lines = recent.map((e) => {
      const status = e.userEvaluation ? ` [${e.userEvaluation}]` : '';
      const path = e.resultPath ? ` → ${e.resultPath}` : '';
      const success = e.resultSuccess ? '✓' : '✗';
      return `#${e.iterationIndex} ${e.toolName}(${summarizeParams(e.parameters)}) ${success}${path}${status}`;
    });

    return `Creative Version Log (${this._entries.length} total, showing last ${recent.length}):\n${lines.join('\n')}`;
  }
}

// =============================================================================
// Utility functions
// =============================================================================

/**
 * Check if a tool name matches generation tool patterns.
 */
export function isGenerationTool(toolName: string): boolean {
  return GENERATION_TOOL_PATTERNS.some((p) => p.test(toolName));
}

/**
 * Detect user evaluation from message text.
 * Returns the evaluation type or undefined if no signal detected.
 */
export function detectEvaluation(
  text: string,
): { evaluation: 'approved' | 'rejected'; note: string } | undefined {
  const lower = text.toLowerCase();

  for (const keyword of REJECTION_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return { evaluation: 'rejected', note: text };
    }
  }

  for (const keyword of APPROVAL_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return { evaluation: 'approved', note: text };
    }
  }

  return undefined;
}

/** Summarize parameters for compact display */
function summarizeParams(params: Record<string, unknown>): string {
  const keys = Object.keys(params);
  if (keys.length === 0) return '';
  if (keys.length <= 3) {
    return keys.map((k) => `${k}=${truncateValue(params[k])}`).join(', ');
  }
  return (
    keys
      .slice(0, 3)
      .map((k) => `${k}=${truncateValue(params[k])}`)
      .join(', ') + ', ...'
  );
}

/** Truncate a value for display */
function truncateValue(value: unknown): string {
  const str = String(value);
  return str.length > 30 ? str.slice(0, 27) + '...' : str;
}

// =============================================================================
// Factory
// =============================================================================

/** Create a new CreativeVersionLog instance */
export function createCreativeVersionLog(): CreativeVersionLog {
  return new CreativeVersionLog();
}
